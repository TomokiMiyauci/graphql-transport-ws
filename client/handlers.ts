import { MessageHandler, SocketHandler } from "../types.ts";
import { PrivateStatus } from "../status.ts";
import { safeSend } from "../utils.ts";
import { ClientMessenger, parseMessage } from "./message.ts";
import {
  CompleteMessage,
  ConnectionAckMessage,
  ErrorMessage,
  NextMessage,
  PingMessage,
  PongMessage,
} from "../message.ts";
import MessageType from "../message_type.ts";

type MessageEventHandlers = {
  onPing: MessageHandler<PingMessage>;
  onPong: MessageHandler<PongMessage>;
  onConnectionArc: MessageHandler<ConnectionAckMessage>;
  onNext: MessageHandler<NextMessage>;
  onError: MessageHandler<ErrorMessage>;
  onComplete: MessageHandler<CompleteMessage>;
};

export function createMessageHandler(
  { socket }: { socket: WebSocket },
  { onNext, onComplete, onError, onPing, onPong, onConnectionArc }: Partial<
    MessageEventHandlers
  > = {},
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
      case MessageType.Ping: {
        safeSend(
          socket,
          ClientMessenger.pong(),
        );
        await onPing?.(ev);
        break;
      }

      case MessageType.Pong: {
        onPong?.(ev);
        break;
      }

      case MessageType.ConnectionAck: {
        onConnectionArc?.(ev);
        break;
      }

      case MessageType.Next: {
        onNext?.(ev);
        break;
      }

      case MessageType.Error: {
        onError?.(ev);
        break;
      }

      case MessageType.Complete: {
        onComplete?.(ev);
      }
    }
  };
}

export function createSocketHandler(
  options?: Partial<MessageEventHandlers>,
): SocketHandler {
  return (socket) => {
    const messageHandler = createMessageHandler({ socket }, options);

    socket.addEventListener("message", messageHandler);

    socket.addEventListener("close", () => {
      socket.removeEventListener("message", messageHandler);
    }, { once: true });
  };
}
