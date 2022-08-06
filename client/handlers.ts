import { MessageHandler } from "../types.ts";
import { Dispose } from "../utils.ts";
import { parseMessage } from "./message.ts";
import {
  CompleteMessage,
  ConnectionAckMessage,
  ErrorMessage,
  NextMessage,
  PingMessage,
  PongMessage,
} from "../message.ts";
import MessageType from "../message_type.ts";
import { GraphQLEventMap } from "../client.ts";

export interface GraphQLClientEventMap extends GraphQLEventMap {
  connectionArc: MessageEvent<ConnectionAckMessage>;
  next: MessageEvent<NextMessage>;

  error: MessageEvent<ErrorMessage>;
}

type MessageEventHandlers = {
  onPing: MessageHandler<PingMessage>;
  onPong: MessageHandler<PongMessage>;
  onConnectionArc: MessageHandler<ConnectionAckMessage>;
  onNext: MessageHandler<NextMessage>;
  onError: MessageHandler<ErrorMessage>;
  onComplete: MessageHandler<CompleteMessage>;
};

export function createMessageHandler(
  {
    onComplete,
    onConnectionArc,
    onError,
    onNext,
    onPing,
    onPong,
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
    const messageHandler = createMessageHandler(options);

    const dispose: Dispose = () => {
      socket.removeEventListener("message", messageHandler);
    };

    socket.addEventListener("message", messageHandler);
    socket.addEventListener("close", dispose, { once: true });

    return dispose;
  };
}
