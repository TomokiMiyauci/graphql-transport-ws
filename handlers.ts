import { safeSend } from "./utils.ts";

import { Messenger, PingMessage } from "./message.ts";

export function createPingHandler(socket: WebSocket) {
  return (_: MessageEvent<PingMessage>) => {
    safeSend(
      socket,
      JSON.stringify(Messenger.pong()),
    );
  };
}
