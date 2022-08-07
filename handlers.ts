import { Dispose, Messenger, safeSend } from "./utils.ts";
import parseMessage from "./parse.ts";
import {
  CompleteMessage,
  ConnectionAckMessage,
  ConnectionInitMessage,
  ErrorMessage,
  GraphQLArgs,
  MessageEventHandler,
  NextMessage,
  PingMessage,
  PongMessage,
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
  OperationTypeNode,
  parse,
  safeSync,
  subscribe,
  validate,
} from "./deps.ts";
import {
  DEFAULT_CONNECTION_TIMEOUT,
  MessageType,
  Status,
  STATUS_TEXT,
} from "./constants.ts";

/** `MessageEvent` handler map. */
export type MessageEventHandlers = {
  /** Call on `connection_init` message. */
  onConnectionInit: MessageEventHandler<ConnectionInitMessage>;

  /** Call on `connection_ack` message. */
  onConnectionAck: MessageEventHandler<ConnectionAckMessage>;

  /** Call on `ping` message. */
  onPing: MessageEventHandler<PingMessage>;

  /** Call on `pong` message. */
  onPong: MessageEventHandler<PongMessage>;

  /** Call on `subscribe` message. */
  onSubscribe: MessageEventHandler<SubscribeMessage>;

  /** Call on `next` message. */
  onNext: MessageEventHandler<NextMessage>;

  /** Call on `error` message. */
  onError: MessageEventHandler<ErrorMessage>;

  /** Call on `complete` message. */
  onComplete: MessageEventHandler<CompleteMessage>;

  /** Call on unknown/unsupported message. */
  onUnknown: EventListener;
};

/** Create `ping` event handler. */
export function createPingHandler(
  socket: WebSocket,
): MessageEventHandler<PingMessage> {
  return () => {
    safeSend(
      socket,
      JSON.stringify(Messenger.pong()),
    );
  };
}

export type CreateOpenHandlerOptions = {
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

export function createMessageEventHandler(
  {
    onComplete,
    onConnectionAck,
    onError,
    onNext,
    onPing,
    onPong,
    onConnectionInit,
    onSubscribe,
    onUnknown,
  }: Readonly<Partial<MessageEventHandlers>> = {},
): MessageEventHandler {
  return async (ev) => {
    const [message, error] = parseMessage(ev.data);

    if (!message) {
      const event = new MessageEvent(ev.type, {
        ...ev,
        data: error.message,
      });
      await onUnknown?.(event);
      return;
    }

    const deserializedMessageEvent = new MessageEvent(ev.type, {
      ...ev,
      data: message,
    });

    const MessageTypeHandler = {
      [MessageType.ConnectionInit]: onConnectionInit,
      [MessageType.ConnectionAck]: onConnectionAck,
      [MessageType.Ping]: onPing,
      [MessageType.Pong]: onPong,
      [MessageType.Subscribe]: onSubscribe,
      [MessageType.Next]: onNext,
      [MessageType.Error]: onError,
      [MessageType.Complete]: onComplete,
    };

    return MessageTypeHandler[message.type]?.(deserializedMessageEvent);
  };
}

/** Create `open` socket handler */
export function createOpenHandler(
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

export function createSocketListener(
  options?: Partial<MessageEventHandlers>,
): (socket: WebSocket) => Dispose {
  return (socket) => {
    const messageHandler = createMessageEventHandler(options);

    const dispose: Dispose = () => {
      socket.removeEventListener("message", messageHandler);
    };

    socket.addEventListener("message", messageHandler);
    socket.addEventListener("close", dispose, { once: true });

    return dispose;
  };
}

export type SocketListenerContext = {
  authorized: boolean;
  idMap: Map<string, AsyncGenerator>;
};

/** Create `connectioninit` event handler. */
export function createConnectionInitHandler(
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

/** Create `complete` event handler */
export function createCompleteHandler(
  _: WebSocket,
  { idMap }: SocketListenerContext,
): MessageEventHandler<CompleteMessage> {
  return async ({ data: { id } }) => {
    // Cancel subscription iteration when complete message receive.
    const asyncGen = idMap.get(id);
    idMap.delete(id);
    await asyncGen?.return(undefined);
  };
}

export function createSubscribeHandler(
  socket: WebSocket,
  ctx: SocketListenerContext,
  {
    schema,
    operationName,
    contextValue,
    document,
    fieldResolver,
    rootValue,
    subscribeFieldResolver,
    typeResolver,
    variableValues,
  }: Readonly<GraphQLArgs>,
): MessageEventHandler<SubscribeMessage> {
  return async ({ data: { id, payload } }) => {
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
      () => document ?? parse(payload.query),
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
      variableValues,
      schema,
      ...payload,
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

/** Create unknown/unsupported message event handler. */
export function createUnknownHandler(socket: WebSocket): EventListener {
  return () => {
    socket.close(
      Status.BadRequest,
      STATUS_TEXT[Status.BadRequest](`Invalid message received`),
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

// deno-lint-ignore no-explicit-any
function toJSON<T extends { toJSON: (...args: any) => any }>(
  value: T,
): ReturnType<T["toJSON"]> {
  return value.toJSON();
}
