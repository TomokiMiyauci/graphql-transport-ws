// deno-lint-ignore-file no-explicit-any
import {
  GraphQLTransportWs,
  GraphQLTransportWsEventMap,
  GraphQLTransportWsImpl,
} from "./graphql_transport_ws.ts";
import { createWebSocket } from "./utils.ts";
import { createPingHandler } from "./handlers.ts";

type GraphQLClientOptions = {
  disableConnectionInit: boolean;
};

type GraphQLClientEventMap = Pick<
  GraphQLTransportWsEventMap,
  "ping" | "pong" | "complete" | "connectionack" | "next" | "error"
>;

interface Client
  extends Omit<GraphQLTransportWs, "connectionAck" | "next" | "error"> {
  addEventListener<K extends keyof GraphQLClientEventMap>(
    type: K,
    listener: (this: Client, ev: GraphQLClientEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof GraphQLClientEventMap>(
    type: K,
    listener: (this: Client, ev: GraphQLClientEventMap[K]) => any,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}

export function createClient(
  url: string | URL,
  { disableConnectionInit }: Readonly<Partial<GraphQLClientOptions>> = {},
): Client {
  const socket = createWebSocket(url);
  const client = new GraphQLTransportWsImpl(socket) as Client;

  const pingHandler = createPingHandler(client.socket);

  client.addEventListener("ping", pingHandler);

  if (!disableConnectionInit) {
    client.connectionInit();
  }

  client.socket.addEventListener("close", () => {
    client.removeEventListener("ping", pingHandler);
  }, { once: true });

  return client;
}
