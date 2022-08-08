// deno-lint-ignore-file no-explicit-any

import {
  createGraphQLTransportWs,
  GraphQLTransportWs,
  GraphQLTransportWsEventMap,
} from "./graphql_transport_ws.ts";
import { createPingHandler, Dispose, Messenger, safeSend } from "./utils.ts";
import {
  CompleteMessage,
  ConnectionInitMessage,
  GraphQLArgs,
  MessageEventHandler,
  PartialExecutionArgs,
  RequiredExecutionArgs,
  SubscribeMessage,
} from "./types.ts";
import {
  DocumentNode,
  execute,
  ExecutionArgs,
  getOperationAST,
  GraphQLError,
  isAsyncIterable,
  isRequestError,
  isString,
  OperationTypeNode,
  parse,
  safeSync,
  subscribe,
  validate,
} from "./deps.ts";
import {
  DEFAULT_CONNECTION_TIMEOUT,
  Status,
  STATUS_TEXT,
  UNKNOWN,
} from "./constants.ts";

export type ServerEventMap = Pick<
  GraphQLTransportWsEventMap,
  "ping" | "pong" | "complete" | "connectioninit" | "subscribe"
>;

export interface Server extends GraphQLTransportWs {
  addEventListener<K extends keyof ServerEventMap>(
    type: K,
    listener: (this: Server, ev: ServerEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof ServerEventMap>(
    type: K,
    listener: (this: Server, ev: ServerEventMap[K]) => any,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}

export type ServerParams =
  & { url: string | URL | WebSocket }
  & RequiredExecutionArgs;

/** Create server-side `graphql-transport-ws` sub-protocol compliant API. */
export function createServer(
  { url, schema }: Readonly<ServerParams>,
  options: Partial<PartialExecutionArgs> = {},
): Server {
  const client = createGraphQLTransportWs(url) as Server;

  const idMap = new Map<string, AsyncGenerator>();
  const ctx: SocketListenerContext = {
    authorized: false,
    idMap,
  };
  const graphQLArgs: GraphQLArgs = {
    schema,
    ...options,
  };

  const pingHandler = createPingHandler(client.socket);
  const connectionInitHandler = createConnectionInitHandler(client.socket, ctx);
  const completeHandler = createCompleteHandler(client.socket, ctx);
  const subscribeHandler = createSubscribeHandler(
    client.socket,
    ctx,
    graphQLArgs,
  );
  const openHandler = createOpenHandler(client.socket, ctx, {});
  const unknownHandler = createUnknownHandler(client.socket);

  client.addEventListener("ping", pingHandler);
  client.addEventListener("connectioninit", connectionInitHandler);
  client.addEventListener("complete", completeHandler);
  client.addEventListener("subscribe", subscribeHandler);
  client.addEventListener(UNKNOWN, unknownHandler);
  client.socket.addEventListener("open", openHandler, { once: true });

  client.socket.addEventListener("close", async () => {
    await Promise.all(
      Array.from(ctx.idMap).map(async ([id, asyncGen]) => {
        ctx.idMap.delete(id);
        await asyncGen.return(undefined);
      }),
    );
    client.removeEventListener("subscribe", subscribeHandler);
    client.removeEventListener("ping", pingHandler);
    client.removeEventListener("connectioninit", connectionInitHandler);
    client.removeEventListener("complete", completeHandler);
    client.removeEventListener(UNKNOWN, unknownHandler);
    client.socket.removeEventListener("open", openHandler);
  }, { once: true });

  return client;
}

type CreateOpenHandlerOptions = {
  /**
   * The amount of time for which the server will wait
   * for `ConnectionInit` message.
   *
   * If the wait timeout has passed and the client
   * has not sent the `connection_init` message,
   * the server will terminate the socket by
   * dispatching a close event `4408: Connection initialization timeout`
   *
   * @default 3_000
   */
  connectionInitWaitTimeout?: number;
};

/** Create `open` socket handler */
function createOpenHandler(
  socket: WebSocket,
  ctx: SocketListenerContext,
  { connectionInitWaitTimeout = DEFAULT_CONNECTION_TIMEOUT }: Readonly<
    Partial<CreateOpenHandlerOptions>
  > = {},
): () => Dispose | void {
  return () => {
    // Close socket if the connection has not been initialized after the specified wait timeout.
    const clear = setClearableTimeout(() => {
      if (!ctx.authorized) {
        socket.close(
          Status.ConnectionInitializationTimeout,
          STATUS_TEXT[Status.ConnectionInitializationTimeout],
        );
      }
    }, connectionInitWaitTimeout);

    return clear;
  };
}

type SocketListenerContext = {
  authorized: boolean;
  idMap: Map<string, AsyncGenerator>;
};

/** Create `connectioninit` event handler. */
function createConnectionInitHandler(
  socket: WebSocket,
  ctx: SocketListenerContext,
): MessageEventHandler<ConnectionInitMessage> {
  return () => {
    if (ctx.authorized) {
      socket.close(
        Status.TooManyInitializationRequests,
        STATUS_TEXT[Status.TooManyInitializationRequests],
      );
      return;
    }
    ctx.authorized = true;

    safeSend(
      socket,
      JSON.stringify(Messenger.connectionAck()),
    );
  };
}

function createSubscribeHandler(
  socket: WebSocket,
  ctx: SocketListenerContext,
  {
    schema,
    operationName: _operationName,
    contextValue,
    document,
    fieldResolver,
    rootValue,
    subscribeFieldResolver,
    typeResolver,
    variableValues: _variableValues,
  }: Readonly<GraphQLArgs>,
): MessageEventHandler<SubscribeMessage> {
  return async (
    {
      data: {
        id,
        payload: {
          query,
          operationName = _operationName,
          variables: variableValues = _variableValues,
        },
      },
    },
  ) => {
    if (!ctx.authorized) {
      socket.close(
        Status.Unauthorized,
        STATUS_TEXT[Status.Unauthorized],
      );
      return;
    }

    if (ctx.idMap.has(id)) {
      socket.close(
        Status.SubscriberAlreadyExists,
        STATUS_TEXT[Status.SubscriberAlreadyExists](id),
      );
      return;
    }

    const [documentNode, error] = safeSync<DocumentNode, GraphQLError>(
      () => document ?? parse(query),
    );

    if (!documentNode) {
      const msg = Messenger.error(id, [error]);
      safeSend(socket, JSON.stringify(msg));
      return;
    }

    const validationResult = validate(schema, documentNode);

    if (validationResult.length) {
      const msg = Messenger.error(id, validationResult.map(toJSON));
      safeSend(socket, JSON.stringify(msg));
      return;
    }

    const operationAST = getOperationAST(documentNode);

    if (!operationAST) {
      const msg = Messenger.error(id, [
        new GraphQLError("Unable to identify operation"),
      ]);

      safeSend(socket, JSON.stringify(msg));
      return;
    }

    const executor = getExecutor(operationAST.operation);

    const executionArgs: ExecutionArgs = {
      operationName,
      contextValue,
      document: documentNode,
      fieldResolver,
      rootValue,
      subscribeFieldResolver,
      typeResolver,
      schema,
      variableValues,
    };

    const executionResult = await executor(executionArgs);

    if (isAsyncIterable(executionResult)) {
      ctx.idMap.set(id, executionResult);

      for await (const result of executionResult) {
        if (ctx.idMap.has(id)) {
          const msg = Messenger.next(id, result);
          safeSend(socket, JSON.stringify(msg));
        }
      }
    } else {
      const msg = isRequestError(executionResult)
        ? Messenger.error(
          id,
          executionResult.errors.map(toJSON),
        )
        : Messenger.next(id, executionResult);

      safeSend(socket, JSON.stringify(msg));
    }

    const has = ctx.idMap.has(id);
    ctx.idMap.delete(id);
    if (has) {
      const msg = Messenger.complete(id);
      safeSend(socket, JSON.stringify(msg));
    }
  };
}

/** Create `complete` event handler */
function createCompleteHandler(
  _: WebSocket,
  { idMap }: SocketListenerContext,
): MessageEventHandler<CompleteMessage> {
  return async ({ data: { id } }) => {
    // Cancel subscription iteration when complete message receive.
    const asyncGen = idMap.get(id);
    if (asyncGen) {
      idMap.delete(id);
      await asyncGen.return(undefined);
    }
  };
}

/** Create unknown/unsupported message event handler. */
function createUnknownHandler(socket: WebSocket): EventListener {
  return (ev) => {
    const message = ev instanceof MessageEvent && isString(ev.data)
      ? ev.data
      : `Invalid message received`;

    socket.close(
      Status.BadRequest,
      STATUS_TEXT[Status.BadRequest](message),
    );
  };
}

function setClearableTimeout(
  ...args: Parameters<typeof setTimeout>
): () => void {
  const id = setTimeout.apply(null, args);

  return () => {
    clearTimeout(id);
  };
}

function getExecutor(
  operationTypeNode: OperationTypeNode,
): typeof subscribe | typeof execute {
  return operationTypeNode === "subscription" ? subscribe : execute;
}

function toJSON<T extends { toJSON: (...args: any) => any }>(
  value: T,
): ReturnType<T["toJSON"]> {
  return value.toJSON();
}
