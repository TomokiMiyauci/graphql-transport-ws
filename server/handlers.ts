import {
  MessageHandler,
  PartialExecutionArgs,
  RequiredExecutionArgs,
  SocketHandler,
} from "../types.ts";
import { safeSend } from "../utils.ts";
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

type MessageEventHandlers = {
  onPing: MessageHandler<PongMessage>;
  onPong: MessageHandler<PingMessage>;
  onConnectionInit: MessageHandler<ConnectionInitMessage>;
  onSubscribe: MessageHandler<SubscribeMessage>;
  onComplete: MessageHandler<CompleteMessage>;
};

export type ClearableMessageHandler = (
  ev: MessageEvent,
) => Promise<(() => void) | undefined>;

const DEFAULT_CONNECTION_TIMEOUT = 3_000;

export type Params = { socket: WebSocket } & RequiredExecutionArgs;
export type Options = MessageEventHandlers & PartialExecutionArgs;

export function createMessageHandler(
  { socket, schema }: Readonly<Params>,
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
  let hasConnected = false;

  return async (ev) => {
    const [message, error] = parseMessage(ev.data);

    if (!message) {
      socket.close(
        PrivateStatus.BadRequest,
        `Invalid message received. ${error.message}`,
      );
      return;
    }

    // Close socket if the connection has not been initialized after the specified wait timeout.
    const clear = setClearableTimeout(() => {
      if (!hasConnected) {
        socket.close(
          PrivateStatus.ConnectionInitializationTimeout,
          PRIVATE_STATUS_TEXT[PrivateStatus.ConnectionInitializationTimeout],
        );
      }
    }, DEFAULT_CONNECTION_TIMEOUT);

    switch (message.type) {
      case MessageType.ConnectionInit: {
        if (hasConnected) {
          socket.close(
            PrivateStatus.TooManyInitializationRequests,
            PRIVATE_STATUS_TEXT[PrivateStatus.TooManyInitializationRequests],
          );
          break;
        }

        hasConnected = true;

        safeSend(
          socket,
          ServerMessenger.connectionArc(),
        );
        await onConnectionInit?.(ev);
        break;
      }

      case MessageType.Ping: {
        safeSend(
          socket,
          Messenger.pong(),
        );
        await onPing?.(ev);
        break;
      }

      case MessageType.Pong: {
        await onPong?.(ev);
        break;
      }

      case MessageType.Subscribe: {
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
          safeSend(socket, msg);
          break;
        }

        const validationResult = validate(schema, documentNode);
        if (validationResult.length) {
          const msg = ServerMessenger.error(id, validationResult);
          safeSend(socket, msg);
          break;
        }

        const operationAST = getOperationAST(documentNode);

        if (!operationAST) {
          const msg = ServerMessenger.error(id, [
            new GraphQLError("Unable to identify operation"),
          ]);

          safeSend(socket, msg);
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
            const msg = ServerMessenger.next(id, result);
            safeSend(socket, msg);
          }
        } else {
          const msg = isRequestError(executionResult)
            ? ServerMessenger.error(id, executionResult.errors)
            : ServerMessenger.next(id, executionResult);

          safeSend(socket, msg);
        }

        const msg = ServerMessenger.complete(id);
        safeSend(socket, msg);
        idMap.delete(id);
        break;
      }

      case MessageType.Complete: {
        const { id } = message;
        // Cancel subscription iteration when complete message receive.
        const asyncGen = idMap.get(id);
        await asyncGen?.return(undefined);
        idMap.delete(id);

        await onComplete?.(ev);
        break;
      }
    }

    return () => {
      clear();
    };
  };
}

function getExecutor(
  operationTypeNode: OperationTypeNode,
): typeof subscribe | typeof execute {
  return operationTypeNode === "subscription" ? subscribe : execute;
}

function createOpenHandler(socket: WebSocket): EventListener {
  return (): void => {
    if (socket.protocol !== PROTOCOL) {
      socket.close(
        PrivateStatus.SubprotocolNotAcceptable,
        "Sub protocol is not acceptable",
      );
    }
  };
}

export function createSocketHandler(
  schema: GraphQLSchema,
  options: Readonly<Partial<Options>> = {},
): SocketHandler {
  return (socket) => {
    const openHandler = createOpenHandler(socket);
    socket.addEventListener("open", openHandler, { once: true });

    const messageHandler = createMessageHandler({
      socket,
      schema,
    }, options);

    socket.addEventListener("message", messageHandler);

    socket.addEventListener("close", () => {
      socket.removeEventListener("open", openHandler);
      socket.removeEventListener("message", messageHandler);
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
