import {
  MessageHandler,
  PartialExecutionArgs,
  RequiredExecutionArgs,
  SocketHandler,
} from "../types.ts";
import { safeSend } from "../utils.ts";
import { PrivateStatus } from "../status.ts";
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
): MessageHandler {
  return async (ev) => {
    const [message, error] = parseMessage(ev.data);

    if (!message) {
      return socket.close(
        PrivateStatus.BadRequest,
        `Invalid message received. ${error.message}`,
      );
    }

    switch (message.type) {
      case MessageType.ConnectionInit: {
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
        const { payload } = message;

        const [documentNode, error] = safeSync<DocumentNode, GraphQLError>(
          () => document ?? parse(payload.query),
        );
        if (!documentNode) {
          const msg = ServerMessenger.error(message.id, [error]);
          return safeSend(socket, msg);
        }

        const validationResult = validate(schema, documentNode);
        if (validationResult.length) {
          const msg = ServerMessenger.error(message.id, validationResult);
          return safeSend(socket, msg);
        }

        const operationAST = getOperationAST(documentNode);

        if (!operationAST) {
          const msg = ServerMessenger.error(message.id, [
            new GraphQLError("Unable to identify operation"),
          ]);

          return safeSend(socket, msg);
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
          for await (const result of executionResult) {
            const msg = ServerMessenger.next(message.id, result);
            safeSend(socket, msg);
          }
        } else {
          const msg = isRequestError(executionResult)
            ? ServerMessenger.error(message.id, executionResult.errors)
            : ServerMessenger.next(message.id, executionResult);

          safeSend(socket, msg);
        }

        const msg = ServerMessenger.complete(message.id);
        safeSend(socket, msg);
        await onSubscribe?.(ev);
        break;
      }

      case MessageType.Complete: {
        await onComplete?.(ev);
        break;
      }
    }
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
