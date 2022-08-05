import { safeSync } from "./deps.ts";
import { PROTOCOL } from "./constants.ts";

type Result =
  | { sendable: false }
  | { sendable: true; sended: true }
  | { sendable: true; sended: false; dispose: () => void };

export type Dispose = () => void;

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
