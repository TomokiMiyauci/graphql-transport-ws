import { MessageHandler } from "../types.ts";
import { PrivateStatus } from "../status.ts";
import { Dispose, safeSend } from "../utils.ts";
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

    const deserializedMessageEvent = new MessageEvent(ev.type, {
      ...ev,
      data: message,
    });

    switch (message.type) {
      case MessageType.Ping: {
        safeSend(
          socket,
          JSON.stringify(ClientMessenger.pong()),
        );

        await onPing?.(deserializedMessageEvent);
        break;
      }

      case MessageType.Pong: {
        await onPong?.(deserializedMessageEvent);
        break;
      }

      case MessageType.ConnectionAck: {
        await onConnectionArc?.(deserializedMessageEvent);
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

      case MessageType.Complete: {
        await onComplete?.(deserializedMessageEvent);
      }
    }
  };
}

export function createSocketHandler(
  options?: Partial<MessageEventHandlers>,
): (socket: WebSocket) => Dispose {
  return (socket) => {
    const messageHandler = createMessageHandler({ socket }, options);

    const dispose: Dispose = () => {
      socket.removeEventListener("message", messageHandler);
    };

    socket.addEventListener("message", messageHandler);
    socket.addEventListener("close", dispose, { once: true });

    return dispose;
  };
}
