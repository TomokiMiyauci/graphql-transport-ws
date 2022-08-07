// deno-lint-ignore-file no-explicit-any
import {
  createCompleteHandler,
  createConnectionInitHandler,
  createOpenHandler,
  createPingHandler,
  createSubscribeHandler,
  createUnknownHandler,
  SocketListenerContext,
} from "./handlers.ts";
import {
  createGraphQLTransportWs,
  GraphQLTransportWs,
  GraphQLTransportWsEventMap,
} from "./graphql_transport_ws.ts";
import { UNKNOWN } from "./constants.ts";
import {
  GraphQLArgs,
  PartialExecutionArgs,
  RequiredExecutionArgs,
} from "./types.ts";

export type ServerEventMap = Pick<
  GraphQLTransportWsEventMap,
  "ping" | "pong" | "complete" | "connectioninit" | "subscribe"
>;

export interface Server extends GraphQLTransportWs {
  addEventListener<K extends keyof ServerEventMap>(
    type: K,
    listener: (this: Server, ev: ServerEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof ServerEventMap>(
    type: K,
    listener: (this: Server, ev: ServerEventMap[K]) => any,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}

export type ServerParams =
  & { url: string | URL | WebSocket }
  & RequiredExecutionArgs;

/** Create server-side `graphql-transport-ws` sub-protocol compliant API. */
export function createServer(
  { url, schema }: Readonly<ServerParams>,
  options: Partial<PartialExecutionArgs> = {},
): Server {
  const client = createGraphQLTransportWs(url) as Server;

  const idMap = new Map<string, AsyncGenerator>();
  const ctx: SocketListenerContext = {
    authorized: false,
    idMap,
  };
  const graphQLArgs: GraphQLArgs = {
    schema,
    ...options,
  };

  const pingHandler = createPingHandler(client.socket);
  const connectionInitHandler = createConnectionInitHandler(client.socket, ctx);
  const completeHandler = createCompleteHandler(client.socket, ctx);
  const subscribeHandler = createSubscribeHandler(
    client.socket,
    ctx,
    graphQLArgs,
  );
  const openHandler = createOpenHandler(client.socket, ctx, {});
  const unknownHandler = createUnknownHandler(client.socket);

  client.addEventListener("ping", pingHandler);
  client.addEventListener("connectioninit", connectionInitHandler);
  client.addEventListener("complete", completeHandler);
  client.addEventListener("subscribe", subscribeHandler);
  client.addEventListener(UNKNOWN, unknownHandler);
  client.socket.addEventListener("open", openHandler, { once: true });

  client.socket.addEventListener("close", async () => {
    await Promise.all(
      Array.from(ctx.idMap).map(async ([id, asyncGen]) => {
        ctx.idMap.delete(id);
        await asyncGen.return(undefined);
      }),
    );
    client.removeEventListener("subscribe", subscribeHandler);
    client.removeEventListener("ping", pingHandler);
    client.removeEventListener("connectioninit", connectionInitHandler);
    client.removeEventListener("complete", completeHandler);
    client.removeEventListener(UNKNOWN, unknownHandler);
    client.socket.removeEventListener("open", openHandler);
  }, { once: true });

  return client;
}
