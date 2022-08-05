import { Sender, SenderImpl } from "../sender.ts";
import { ClientMessenger } from "./message.ts";
import { GraphQLRequestParameters } from "../deps.ts";
import { Dispose, getDispose, safeSend } from "../utils.ts";

export interface ClientSender extends Sender {
  connectionInit(): undefined | Dispose;
  subscribe(
    id: string,
    payload: GraphQLRequestParameters,
  ): undefined | Dispose;
}

export class ClientSenderImpl extends SenderImpl implements ClientSender {
  constructor(protected socket: WebSocket) {
    super(socket);
  }

  connectionInit() {
    const result = safeSend(
      this.socket,
      JSON.stringify(ClientMessenger.connectionInit()),
    );

    return getDispose(result);
  }

  subscribe(id: string, payload: GraphQLRequestParameters) {
    const result = safeSend(
      this.socket,
      JSON.stringify(ClientMessenger.subscribe(id, payload)),
    );

    return getDispose(result);
  }
}

export function createSender(socket: WebSocket): ClientSender {
  return new ClientSenderImpl(socket);
}
