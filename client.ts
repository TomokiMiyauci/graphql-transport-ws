// deno-lint-ignore-file no-explicit-any
import {
  createGraphQLTransportWs,
  GraphQLTransportWs,
  GraphQLTransportWsEventMap,
} from "./graphql_transport_ws.ts";
import { createPingHandler } from "./handlers.ts";

export type ClientEventMap = Pick<
  GraphQLTransportWsEventMap,
  "ping" | "pong" | "complete" | "connectionack" | "next" | "error"
>;

export interface Client
  extends Omit<GraphQLTransportWs, "connectionAck" | "next" | "error"> {
  addEventListener<K extends keyof ClientEventMap>(
    type: K,
    listener: (
      this: Client,
      ev: ClientEventMap[K],
    ) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof ClientEventMap>(
    type: K,
    listener: (
      this: Client,
      ev: ClientEventMap[K],
    ) => any,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}

export type ClientOptions = {
  /** Whether to disable sending `ConnectionInit` messages during initialization.
   * If you set this to `true`, you must send the `ConnectionInit` message before the server allows you to wait.
   * @default false
   */
  disableInitialConnection: boolean;
};

/** Create client-side `graphql-transport-ws` sub-protocol compliant API.
 * @throws SyntaxError
 * - parsing of `url` fails
 * - `url` has a scheme other than `ws` or `wss`
 * - `url` has a fragment
 * - any of the values in `protocols` occur more than once, or otherwise fail to match the requirements for elements that comprise the value of `Sec-WebSocket-Protocol` fields as defined by the WebSocket Protocol specification
 */
export function createClient(
  url: string | URL | WebSocket,
  { disableInitialConnection }: Readonly<Partial<ClientOptions>> = {},
): Client {
  const client = createGraphQLTransportWs(url);
  const pingHandler = createPingHandler(client.socket);

  client.addEventListener("ping", pingHandler);

  client.socket.addEventListener("close", () => {
    client.removeEventListener("ping", pingHandler);
  }, { once: true });

  if (!disableInitialConnection) {
    client.connectionInit();
  }

  return client;
}
