import { Messenger } from "./message.ts";
import { safeSend } from "./utils.ts";

export interface Sender {
  ping(): void;
  pong(): void;
  complete(id: string): void;
}

export class SenderImpl implements Sender {
  constructor(protected socket: WebSocket) {}

  ping() {
    safeSend(this.socket, Messenger.ping());
  }

  pong(): void {
    safeSend(this.socket, Messenger.pong());
  }

  complete(id: string): void {
    safeSend(this.socket, Messenger.complete(id));
  }
}
