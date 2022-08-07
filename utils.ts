import { GraphQLRequestParameters, safeSync } from "./deps.ts";
import { PROTOCOL } from "./constants.ts";
import {
  CompleteMessage,
  ConnectionAckMessage,
  ConnectionInitMessage,
  ErrorMessage,
  NextMessage,
  PingMessage,
  PongMessage,
  SubscribeMessage,
} from "./types.ts";
import { MessageType } from "./constants.ts";

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

  const readyState = socket.readyState;

  switch (readyState) {
    case socket.CONNECTING: {
      socket.addEventListener("open", openHandler, { once: true });
      const dispose = (): void => {
        socket.removeEventListener("open", openHandler);
      };

      socket.addEventListener("close", dispose, { once: true });

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

/** Create `WebSocket` instance with `graphql-transport-ws` sub-protocol.  */
export function createWebSocket(url: string | URL): WebSocket {
  return new WebSocket(url, PROTOCOL);
}

export interface Sender {
  connectionAck(payload?: ConnectionAckMessage["payload"]): void;
  connectionInit(): undefined | Dispose;
  ping(): Dispose | undefined;
  pong(): Dispose | undefined;
  subscribe(
    id: string,
    payload: GraphQLRequestParameters,
  ): undefined | Dispose;
  next(id: NextMessage["id"], payload: NextMessage["payload"]): void;
  error(id: ErrorMessage["id"], payload: ErrorMessage["payload"]): void;
  complete(id: string): Dispose | undefined;
}

export class SenderImpl implements Sender {
  constructor(protected socket: WebSocket) {}

  ping() {
    const result = safeSend(this.socket, JSON.stringify(Messenger.ping()));
    return getDispose(result);
  }

  pong() {
    const result = safeSend(this.socket, JSON.stringify(Messenger.pong()));
    return getDispose(result);
  }

  complete(id: string) {
    const result = safeSend(
      this.socket,
      JSON.stringify(Messenger.complete(id)),
    );
    return getDispose(result);
  }

  connectionAck(payload?: ConnectionAckMessage["payload"]): void {
    safeSend(
      this.socket,
      JSON.stringify(Messenger.connectionAck(payload)),
    );
  }

  next(
    id: NextMessage["id"],
    payload: NextMessage["payload"],
  ): void {
    safeSend(this.socket, JSON.stringify(Messenger.next(id, payload)));
  }

  error(id: ErrorMessage["id"], payload: ErrorMessage["payload"]): void {
    safeSend(this.socket, JSON.stringify(Messenger.error(id, payload)));
  }

  connectionInit() {
    const result = safeSend(
      this.socket,
      JSON.stringify(Messenger.connectionInit()),
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
