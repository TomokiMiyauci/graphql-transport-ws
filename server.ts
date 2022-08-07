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
import { createWebSocket } from "./utils.ts";
import {
  GraphQLTransportWs,
  GraphQLTransportWsEventMap,
  GraphQLTransportWsImpl,
} from "./graphql_transport_ws.ts";
import { UNKNOWN } from "./constants.ts";
import {
  GraphQLArgs,
  PartialExecutionArgs,
  RequiredExecutionArgs,
} from "./types.ts";

type Params = { url: string | URL | WebSocket } & RequiredExecutionArgs;

type ServerEventMap = Pick<
  GraphQLTransportWsEventMap,
  "ping" | "pong" | "complete" | "connectioninit" | "subscribe"
>;

interface ServerClient extends GraphQLTransportWs {
  addEventListener<K extends keyof ServerEventMap>(
    type: K,
    listener: (this: ServerClient, ev: ServerEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof ServerEventMap>(
    type: K,
    listener: (this: ServerClient, ev: ServerEventMap[K]) => any,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}

export function createServerClient(
  { url, schema }: Readonly<Params>,
  options: Partial<PartialExecutionArgs> = {},
): ServerClient {
  const socket = url instanceof WebSocket ? url : createWebSocket(url);
  const client = new GraphQLTransportWsImpl(socket) as ServerClient;

  const idMap = new Map<string, AsyncGenerator>();
  const ctx: SocketListenerContext = {
    authorized: false,
    idMap,
  };

  const graphQLArgs: GraphQLArgs = {
    schema,
    ...options,
  };

  const pingHandler = createPingHandler(socket);
  const connectionInitHandler = createConnectionInitHandler(socket, ctx);
  const completeHandler = createCompleteHandler(socket, ctx);
  const subscribeHandler = createSubscribeHandler(socket, ctx, graphQLArgs);
  const openHandler = createOpenHandler(socket, ctx, {});
  const unknownHandler = createUnknownHandler(socket);

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
