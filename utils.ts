import { GraphQLRequestParameters, safeSync } from "./deps.ts";
import {
  CompleteMessage,
  ConnectionAckMessage,
  ConnectionInitMessage,
  ErrorMessage,
  MessageEventHandler,
  NextMessage,
  PingMessage,
  PongMessage,
  SubscribeMessage,
} from "./types.ts";
import {
  ADD_EVENT_LISTENER_OPTIONS,
  CLOSE,
  MessageType,
  OPEN,
} from "./constants.ts";

type Result =
  | { sendable: false }
  | { sendable: true; sended: true }
  | { sendable: true; sended: false; dispose: () => void };

export type Dispose = () => void;

export interface Disposable {
  dispose: Dispose;
}

export function safeSend(
  socket: WebSocket,
  data: string | ArrayBufferLike | Blob | ArrayBufferView,
): Result {
  function openHandler(): void {
    safeSync(() => socket.send(data));
  }

  switch (socket.readyState) {
    case socket.CONNECTING: {
      socket.addEventListener(OPEN, openHandler, ADD_EVENT_LISTENER_OPTIONS);
      const dispose = (): void => {
        socket.removeEventListener(OPEN, openHandler);
      };

      socket.addEventListener(CLOSE, dispose, ADD_EVENT_LISTENER_OPTIONS);

      return { sendable: true, sended: false, dispose };
    }
    case socket.OPEN: {
      safeSync(() => socket.send(data));

      return { sendable: true, sended: true };
    }

    default: {
      return { sendable: false };
    }
  }
}

export function getDispose(result: Result): undefined | (() => void) {
  if (result.sendable && !result.sended) {
    return result.dispose;
  }
}

export interface Sender {
  connectionInit(
    payload?: ConnectionInitMessage["payload"],
  ): undefined | Dispose;
  connectionAck(payload?: ConnectionAckMessage["payload"]): undefined | Dispose;
  ping(payload?: PingMessage["payload"]): Dispose | undefined;
  pong(payload?: PongMessage["payload"]): Dispose | undefined;
  subscribe(
    id: string,
    payload: GraphQLRequestParameters,
  ): undefined | Dispose;
  next(
    id: NextMessage["id"],
    payload: NextMessage["payload"],
  ): undefined | Dispose;
  error(
    id: ErrorMessage["id"],
    payload: ErrorMessage["payload"],
  ): undefined | Dispose;
  complete(id: string): Dispose | undefined;
}

export class SenderImpl implements Sender {
  constructor(protected socket: WebSocket) {}

  connectionInit(payload?: ConnectionInitMessage["payload"]) {
    const result = safeSend(
      this.socket,
      JSON.stringify(Messenger.connectionInit(payload)),
    );

    return getDispose(result);
  }

  connectionAck(payload?: ConnectionAckMessage["payload"]) {
    const result = safeSend(
      this.socket,
      JSON.stringify(Messenger.connectionAck(payload)),
    );
    return getDispose(result);
  }

  ping(payload?: PingMessage["payload"]) {
    const result = safeSend(
      this.socket,
      JSON.stringify(Messenger.ping(payload)),
    );
    return getDispose(result);
  }

  pong(payload?: PongMessage["payload"]) {
    const result = safeSend(
      this.socket,
      JSON.stringify(Messenger.pong(payload)),
    );
    return getDispose(result);
  }

  subscribe(id: string, payload: GraphQLRequestParameters) {
    const result = safeSend(
      this.socket,
      JSON.stringify(Messenger.subscribe(id, payload)),
    );

    return getDispose(result);
  }

  next(
    id: NextMessage["id"],
    payload: NextMessage["payload"],
  ) {
    const result = safeSend(
      this.socket,
      JSON.stringify(Messenger.next(id, payload)),
    );
    return getDispose(result);
  }

  error(id: ErrorMessage["id"], payload: ErrorMessage["payload"]) {
    const result = safeSend(
      this.socket,
      JSON.stringify(Messenger.error(id, payload)),
    );
    return getDispose(result);
  }

  complete(id: string) {
    const result = safeSend(
      this.socket,
      JSON.stringify(Messenger.complete(id)),
    );
    return getDispose(result);
  }
}

export class Messenger {
  static connectionAck(
    payload?: ConnectionAckMessage["payload"],
  ): ConnectionAckMessage {
    return {
      type: MessageType.ConnectionAck,
      payload,
    };
  }
  static error(
    id: ErrorMessage["id"],
    payload: ErrorMessage["payload"],
  ): ErrorMessage {
    return {
      id,
      type: MessageType.Error,
      payload,
    };
  }

  static next(
    id: NextMessage["id"],
    payload: NextMessage["payload"],
  ): NextMessage {
    return {
      id,
      type: MessageType.Next,
      payload,
    };
  }
  static ping(payload?: PingMessage["payload"]): PingMessage {
    return {
      type: MessageType.Ping,
      payload,
    };
  }
  static pong(payload?: PongMessage["payload"]): PongMessage {
    return {
      type: MessageType.Pong,
      payload,
    };
  }
  static complete(id: CompleteMessage["id"]): CompleteMessage {
    return {
      id,
      type: MessageType.Complete,
    };
  }
  static connectionInit(
    payload?: ConnectionInitMessage["payload"],
  ): ConnectionInitMessage {
    return {
      type: MessageType.ConnectionInit,
      payload,
    };
  }

  static subscribe(
    id: string,
    payload: GraphQLRequestParameters,
  ): SubscribeMessage {
    return {
      id,
      type: MessageType.Subscribe,
      payload,
    };
  }
}

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
