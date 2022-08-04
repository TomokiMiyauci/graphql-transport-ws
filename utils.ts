import { isPlainObject } from "./deps.ts";
import { PROTOCOL } from "./constants.ts";

export function safeSend(
  socket: WebSocket,
  data:
    | string
    | ArrayBufferLike
    | Blob
    | ArrayBufferView
    // deno-lint-ignore no-explicit-any
    | Record<PropertyKey, any>,
) {
  if (socket.readyState === socket.OPEN) {
    const _data = isPlainObject(data) ? JSON.stringify(data) : data;
    try {
      socket.send(_data);
    } catch {
      // noop
    }
  }
}

/** Create `WebSocket` instance with `graphql-transport-ws` sub-protocol.  */
export function createWebSocket(url: string | URL): WebSocket {
  return new WebSocket(url, PROTOCOL);
}
