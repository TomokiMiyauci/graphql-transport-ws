import { Sender, SenderImpl } from "../sender.ts";
import { ClientMessenger } from "./message.ts";
import { safeSend } from "../utils.ts";
import { GraphQLParameters } from "../deps.ts";

export interface ClientSender extends Sender {
  connectionInit(): void;
  subscribe(id: string, payload: GraphQLParameters): void;
}

export class ClientSenderImpl extends SenderImpl implements ClientSender {
  constructor(protected socket: WebSocket) {
    super(socket);
  }

  connectionInit(): void {
    safeSend(this.socket, ClientMessenger.connectionInit());
  }

  subscribe(id: string, payload: GraphQLParameters): void {
    safeSend(this.socket, ClientMessenger.subscribe(id, payload));
  }
}

export function createSender(socket: WebSocket): ClientSender {
  return new ClientSenderImpl(socket);
}
