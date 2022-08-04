import { Sender, SenderImpl } from "../sender.ts";
import { ConnectionAckMessage, ErrorMessage, NextMessage } from "../message.ts";
import { safeSend } from "../utils.ts";
import { ServerMessenger } from "./message.ts";

interface ServerSender extends Sender {
  connectionArc(payload?: ConnectionAckMessage["payload"]): void;
  next(id: NextMessage["id"], payload: NextMessage["payload"]): void;
  error(id: ErrorMessage["id"], payload: ErrorMessage["payload"]): void;
}

export class ServerSenderImpl extends SenderImpl implements ServerSender {
  constructor(protected socket: WebSocket) {
    super(socket);
  }

  connectionArc(payload?: ConnectionAckMessage["payload"]): void {
    safeSend(this.socket, ServerMessenger.connectionArc(payload));
  }

  next(
    id: NextMessage["id"],
    payload: NextMessage["payload"],
  ): void {
    safeSend(this.socket, ServerMessenger.next(id, payload));
  }

  error(id: ErrorMessage["id"], payload: ErrorMessage["payload"]): void {
    safeSend(this.socket, ServerMessenger.error(id, payload));
  }
}

export function createSender(socket: WebSocket): ServerSender {
  return new ServerSenderImpl(socket);
}
