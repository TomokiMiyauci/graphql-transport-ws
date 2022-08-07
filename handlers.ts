import { Dispose, Messenger, safeSend } from "./utils.ts";
import parseMessage from "./parse.ts";
import {
  CompleteMessage,
  ConnectionAckMessage,
  ConnectionInitMessage,
  ErrorMessage,
  MessageHandler,
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
  PartialBy,
  safeSync,
  subscribe,
  validate,
} from "./deps.ts";
import {
  DEFAULT_CONNECTION_TIMEOUT,
  MessageType,
  PRIVATE_STATUS_TEXT,
  PrivateStatus,
  PROTOCOL,
} from "./constants.ts";

export function createPingHandler(socket: WebSocket) {
  return (_: MessageEvent<PingMessage>) => {
    safeSend(
      socket,
      JSON.stringify(Messenger.pong()),
    );
  };
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

type MessageEventHandlers = {
  onPing: MessageHandler<PingMessage>;
  onPong: MessageHandler<PongMessage>;
  onConnectionAck: MessageHandler<ConnectionAckMessage>;
  onNext: MessageHandler<NextMessage>;
  onError: MessageHandler<ErrorMessage>;
  onComplete: MessageHandler<CompleteMessage>;
  onConnectionInit: MessageHandler<ConnectionInitMessage>;
  onSubscribe: MessageHandler<SubscribeMessage>;
};

export function createMessageHandler(
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
  }: Partial<
    (
      & MessageEventHandlers
      & {
        onUnknown: (
          ev: MessageEvent,
          ctx: { error: SyntaxError | TypeError },
        ) => void | Promise<void>;
      }
    )
  > = {},
): MessageHandler {
  return async (ev) => {
    const [message, error] = parseMessage(ev.data);

    if (!message) {
      await onUnknown?.(ev, { error });
      return;
    }

    const deserializedMessageEvent = new MessageEvent(ev.type, {
      ...ev,
      data: message,
    });

    switch (message.type) {
      case MessageType.Ping: {
        await onPing?.(deserializedMessageEvent);
        break;
      }

      case MessageType.Pong: {
        await onPong?.(deserializedMessageEvent);
        break;
      }

      case MessageType.ConnectionAck: {
        await onConnectionAck?.(deserializedMessageEvent);
        break;
      }

      case MessageType.Next: {
        await onNext?.(deserializedMessageEvent);
        break;
      }

      case MessageType.Error: {
        await onError?.(deserializedMessageEvent);
        break;
      }

      case MessageType.ConnectionInit: {
        await onConnectionInit?.(deserializedMessageEvent);
        break;
      }
      case MessageType.Complete: {
        await onComplete?.(deserializedMessageEvent);
        break;
      }
      case MessageType.Subscribe: {
        await onSubscribe?.(deserializedMessageEvent);
        break;
      }
    }
  };
}

export function createOpenHandler(
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

export function createSocketHandler(
  options?: Partial<MessageEventHandlers>,
): (socket: WebSocket) => Dispose {
  return (socket) => {
    const messageHandler = createMessageHandler(options);

    const dispose: Dispose = () => {
      socket.removeEventListener("message", messageHandler);
    };

    socket.addEventListener("message", messageHandler);
    socket.addEventListener("close", dispose, { once: true });

    return dispose;
  };
}

export type SocketContext = {
  authorized: boolean;
  idMap: Map<string, AsyncGenerator>;
};

export function createConnectionInitHandler(
  socket: WebSocket,
  ctx: SocketContext,
) {
  return (_: MessageEvent<ConnectionInitMessage>) => {
    if (ctx.authorized) {
      socket.close(
        PrivateStatus.TooManyInitializationRequests,
        PRIVATE_STATUS_TEXT[PrivateStatus.TooManyInitializationRequests],
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

export function createCompleteHandler(_: WebSocket, { idMap }: SocketContext) {
  return async ({ data: { id } }: MessageEvent<CompleteMessage>) => {
    // Cancel subscription iteration when complete message receive.
    const asyncGen = idMap.get(id);
    idMap.delete(id);
    await asyncGen?.return(undefined);
  };
}

export type GraphQLArgs = PartialBy<ExecutionArgs, "document">;

export function createSubscribeHandler(
  socket: WebSocket,
  ctx: SocketContext,
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
) {
  return async (ev: MessageEvent<SubscribeMessage>) => {
    if (!ctx.authorized) {
      socket.close(
        PrivateStatus.Unauthorized,
        PRIVATE_STATUS_TEXT[PrivateStatus.Unauthorized],
      );
      return;
    }

    const { id, payload } = ev.data;

    if (ctx.idMap.has(id)) {
      socket.close(
        PrivateStatus.SubscriberAlreadyExists,
        PRIVATE_STATUS_TEXT[PrivateStatus.SubscriberAlreadyExists](id),
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
      const msg = Messenger.error(
        id,
        validationResult.map(toJSON),
      );
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

export function createUnknownHandler(socket: WebSocket) {
  return () => {
    socket.close(
      PrivateStatus.BadRequest,
      `Invalid message received.`,
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
