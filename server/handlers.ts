import {
  MessageHandler,
  PartialExecutionArgs,
  RequiredExecutionArgs,
  SocketHandler,
} from "../types.ts";
import { Dispose, safeSend } from "../utils.ts";
import { PRIVATE_STATUS_TEXT, PrivateStatus } from "../status.ts";
import {
  DocumentNode,
  execute,
  ExecutionArgs,
  getOperationAST,
  GraphQLError,
  GraphQLSchema,
  isAsyncIterable,
  isRequestError,
  OperationTypeNode,
  parse,
  safeSync,
  subscribe,
  validate,
} from "../deps.ts";
import MessageType from "../message_type.ts";
import {
  CompleteMessage,
  ConnectionInitMessage,
  Messenger,
  PingMessage,
  PongMessage,
  SubscribeMessage,
} from "../message.ts";
import { parseMessage, ServerMessenger } from "./message.ts";
import { PROTOCOL } from "../constants.ts";
import { DEFAULT_CONNECTION_TIMEOUT } from "./constants.ts";

type MessageEventHandlers = {
  onPing: MessageHandler<PongMessage>;
  onPong: MessageHandler<PingMessage>;
  onConnectionInit: MessageHandler<ConnectionInitMessage>;
  onSubscribe: MessageHandler<SubscribeMessage>;
  onComplete: MessageHandler<CompleteMessage>;
};

export type ClearableMessageHandler = (
  ev: MessageEvent,
) => Promise<undefined | (() => Promise<void>)>;

export type Params = { socket: WebSocket } & RequiredExecutionArgs;
export type Options = MessageEventHandlers & PartialExecutionArgs & {
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

export function createMessageHandler(
  { socket, schema }: Readonly<Params>,
  ctx: SocketContext,
  {
    onPing,
    onPong,
    onConnectionInit,
    onComplete,
    onSubscribe,
    operationName,
    contextValue,
    document,
    fieldResolver,
    rootValue,
    subscribeFieldResolver,
    typeResolver,
    variableValues,
  }: Readonly<Partial<Options>> = {},
): ClearableMessageHandler {
  const idMap = new Map<string, AsyncGenerator>();

  return async (ev) => {
    const [message, error] = parseMessage(ev.data);

    if (!message) {
      socket.close(
        PrivateStatus.BadRequest,
        `Invalid message received. ${error.message}`,
      );
      return;
    }

    switch (message.type) {
      case MessageType.ConnectionInit: {
        if (ctx.authorized) {
          socket.close(
            PrivateStatus.TooManyInitializationRequests,
            PRIVATE_STATUS_TEXT[PrivateStatus.TooManyInitializationRequests],
          );
          break;
        }

        ctx.authorized = true;

        safeSend(
          socket,
          JSON.stringify(ServerMessenger.connectionArc()),
        );
        await onConnectionInit?.(ev);
        break;
      }

      case MessageType.Ping: {
        safeSend(
          socket,
          JSON.stringify(Messenger.pong()),
        );
        await onPing?.(ev);
        break;
      }

      case MessageType.Pong: {
        await onPong?.(ev);
        break;
      }

      case MessageType.Subscribe: {
        if (!ctx.authorized) {
          socket.close(
            PrivateStatus.Unauthorized,
            PRIVATE_STATUS_TEXT[PrivateStatus.Unauthorized],
          );
          break;
        }
        const { id, payload } = message;

        if (idMap.has(id)) {
          socket.close(
            PrivateStatus.SubscriberAlreadyExists,
            PRIVATE_STATUS_TEXT[PrivateStatus.SubscriberAlreadyExists](id),
          );
          break;
        }

        const [documentNode, error] = safeSync<DocumentNode, GraphQLError>(
          () => document ?? parse(payload.query),
        );
        if (!documentNode) {
          const msg = ServerMessenger.error(id, [error]);
          safeSend(socket, JSON.stringify(msg));
          break;
        }

        const validationResult = validate(schema, documentNode);

        if (validationResult.length) {
          const msg = ServerMessenger.error(
            id,
            validationResult.map(toJSON),
          );
          safeSend(socket, JSON.stringify(msg));
          break;
        }

        const operationAST = getOperationAST(documentNode);

        if (!operationAST) {
          const msg = ServerMessenger.error(id, [
            new GraphQLError("Unable to identify operation"),
          ]);

          safeSend(socket, JSON.stringify(msg));
          break;
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
          variableValues,
          schema,
          ...payload,
        };

        const executionResult = await executor(executionArgs);

        await onSubscribe?.(ev);

        if (isAsyncIterable(executionResult)) {
          idMap.set(id, executionResult);

          for await (const result of executionResult) {
            if (idMap.has(id)) {
              const msg = ServerMessenger.next(id, result);
              safeSend(socket, JSON.stringify(msg));
            }
          }
        } else {
          const msg = isRequestError(executionResult)
            ? ServerMessenger.error(
              id,
              executionResult.errors.map(toJSON),
            )
            : ServerMessenger.next(id, executionResult);

          safeSend(socket, JSON.stringify(msg));
        }

        const has = idMap.has(id);
        idMap.delete(id);
        if (has) {
          const msg = ServerMessenger.complete(id);
          safeSend(socket, JSON.stringify(msg));
        }
        break;
      }

      case MessageType.Complete: {
        const { id } = message;
        // Cancel subscription iteration when complete message receive.
        const asyncGen = idMap.get(id);
        idMap.delete(id);
        await asyncGen?.return(undefined);

        await onComplete?.(ev);
        break;
      }
    }

    return async () => {
      await Promise.all(
        Array.from(idMap).map(async ([id, asyncGen]) => {
          idMap.delete(id);
          await asyncGen.return(undefined);
        }),
      );
    };
  };
}

function getExecutor(
  operationTypeNode: OperationTypeNode,
): typeof subscribe | typeof execute {
  return operationTypeNode === "subscription" ? subscribe : execute;
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

function createOpenHandler(
  socket: WebSocket,
  ctx: SocketContext,
  { connectionInitWaitTimeout = DEFAULT_CONNECTION_TIMEOUT }: Readonly<
    Partial<
      CreateOpenHandlerOptions
    >
  > = {},
): () => Dispose {
  return () => {
    if (socket.protocol !== PROTOCOL) {
      socket.close(
        PrivateStatus.SubprotocolNotAcceptable,
        "Sub protocol is not acceptable",
      );
    }

    // Close socket if the connection has not been initialized after the specified wait timeout.
    const clear = setClearableTimeout(() => {
      if (!ctx.authorized) {
        socket.close(
          PrivateStatus.ConnectionInitializationTimeout,
          PRIVATE_STATUS_TEXT[PrivateStatus.ConnectionInitializationTimeout],
        );
      }
    }, connectionInitWaitTimeout);

    return clear;
  };
}

type SocketContext = {
  authorized: boolean;
};

export function createSocketHandler(
  schema: GraphQLSchema,
  options: Readonly<Partial<Options>> = {},
): SocketHandler {
  return (socket) => {
    const ctx: SocketContext = { authorized: false };

    const openHandler = createOpenHandler(socket, ctx, {
      connectionInitWaitTimeout: options.connectionInitWaitTimeout,
    });

    async function messageHandlerWithClear(ev: MessageEvent): Promise<void> {
      const clear = await messageHandler(ev);

      socket.addEventListener("close", async () => {
        await clear?.();
      }, { once: true });
    }
    socket.addEventListener("open", openHandler, { once: true });

    const messageHandler = createMessageHandler(
      { socket, schema },
      ctx,
      options,
    );

    socket.addEventListener("message", messageHandlerWithClear);

    socket.addEventListener("close", () => {
      socket.removeEventListener("open", openHandler);
      socket.removeEventListener("message", messageHandlerWithClear);
    }, { once: true });
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

// deno-lint-ignore no-explicit-any
function toJSON<T extends { toJSON: (...args: any) => any }>(
  value: T,
): ReturnType<T["toJSON"]> {
  return value.toJSON();
}
