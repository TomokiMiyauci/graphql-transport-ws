import {
  ConnectionAckMessage,
  ErrorMessage,
  Messenger,
  NextMessage,
} from "./message.ts";
import { Dispose, getDispose, safeSend } from "./utils.ts";
import { GraphQLRequestParameters } from "./deps.ts";

export interface Sender {
  ping(): Dispose | undefined;
  pong(): Dispose | undefined;
  complete(id: string): Dispose | undefined;
  connectionAck(payload?: ConnectionAckMessage["payload"]): void;
  next(id: NextMessage["id"], payload: NextMessage["payload"]): void;
  error(id: ErrorMessage["id"], payload: ErrorMessage["payload"]): void;
  connectionInit(): undefined | Dispose;
  subscribe(
    id: string,
    payload: GraphQLRequestParameters,
  ): undefined | Dispose;
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
