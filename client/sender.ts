import { Sender, SenderImpl } from "../sender.ts";
import { ClientMessenger } from "./message.ts";
import { GraphQLParameters } from "../deps.ts";

export interface ClientSender extends Sender {
  connectionInit(): void;
  subscribe(id: string, payload: GraphQLParameters): void;
}

export class ClientSenderImpl extends SenderImpl implements ClientSender {
  constructor(protected socket: WebSocket) {
    super(socket);
  }

  connectionInit() {
    lazySend(
      this.socket,
      JSON.stringify(ClientMessenger.connectionInit()),
    );
  }

  subscribe(id: string, payload: GraphQLParameters): void {
    lazySend(
      this.socket,
      JSON.stringify(ClientMessenger.subscribe(id, payload)),
    );
  }
}

export function createSender(socket: WebSocket): ClientSender {
  return new ClientSenderImpl(socket);
}

type Result = {
  /** Whether send message immediately or not.*/
  immediate: boolean;
  dispose?: () => void;
};

function lazySend(
  socket: WebSocket,
  data: string | ArrayBufferLike | Blob | ArrayBufferView,
): Result {
  function openHandler(): void {
    socket.send(data);
  }

  if (socket.readyState === socket.OPEN) {
    socket.send(data);
    return { immediate: true };
  }

  socket.addEventListener("open", openHandler, { once: true });
  const dispose = (): void => {
    socket.removeEventListener("open", openHandler);
  };

  socket.addEventListener("close", dispose, { once: true });

  return { immediate: false, dispose };
}
