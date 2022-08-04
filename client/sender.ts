import { Sender, SenderImpl } from "../sender.ts";
import { ClientMessenger } from "./message.ts";
import { safeSend } from "../utils.ts";
import { GraphQLParameters } from "../deps.ts";
import { PROTOCOL } from "../constants.ts";

export interface ClientSender extends Sender {
  connectionInit(): void;
  subscribe(id: string, payload: GraphQLParameters): void;
}

export class ClientSenderImpl extends SenderImpl implements ClientSender {
  constructor(public socket: WebSocket) {
    super(socket);
  }

  connectionInit(): void {
    safeSend(this.socket, ClientMessenger.connectionInit());
  }

  subscribe(id: string, payload: GraphQLParameters): void {
    safeSend(this.socket, ClientMessenger.subscribe(id, payload));
  }
}

export function createSender(url: string | URL): ClientSender {
  const ws = new WebSocket(url, PROTOCOL);
  return new ClientSenderImpl(ws);
}
