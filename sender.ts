import { Messenger } from "./message.ts";
import { Dispose, getDispose, safeSend } from "./utils.ts";

export interface Sender {
  ping(): Dispose | undefined;
  pong(): Dispose | undefined;
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
}
