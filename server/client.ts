import { GraphQL, GraphQLEventMap, GraphQLImpl } from "../client.ts";
import { createSender, ServerSender } from "./sender.ts";
import { ConnectionInitMessage, SubscribeMessage } from "../message.ts";
import { createMessageCallback } from "./handlers.ts";
import { createWebSocket } from "../utils.ts";
import {
  createCompleteHandler,
  createConnectionInitHandler,
  createOpenHandler,
  createPingHandler,
  createSubscribeHandler,
  createUnknownHandler,
  GraphQLArgs,
  SocketContext,
} from "./handlers.ts";
import { PartialExecutionArgs, RequiredExecutionArgs } from "../types.ts";
import { ExecutionResult, GraphQLFormattedError } from "../deps.ts";

const UNKNOWN = "$$unknown";

interface GraphQLClientEventMap extends GraphQLEventMap {
  connectioninit: MessageEvent<ConnectionInitMessage>;
  subscribe: MessageEvent<SubscribeMessage>;
}

interface Client extends GraphQL {
  connectionArc(): void;
  next(id: string, payload: ExecutionResult): void;
  error(id: string, payload: GraphQLFormattedError[]): void;

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

class ClientImpl extends GraphQLImpl implements Client {
  #sender: ServerSender;
  constructor(socket: WebSocket) {
    super(socket);

    const messageHandler = createMessageCallback({
      onComplete: (ev) => {
        const event = new MessageEvent("complete", ev);
        this.dispatchEvent(event);
      },
      onPing: (ev) => {
        const event = new MessageEvent("ping", ev);
        this.dispatchEvent(event);
      },
      onPong: (ev) => {
        const event = new MessageEvent("pong", ev);
        this.dispatchEvent(event);
      },
      onConnectionInit: (ev) => {
        const event = new MessageEvent("connectioninit", ev);
        this.dispatchEvent(event);
      },
      onSubscribe: (ev) => {
        const event = new MessageEvent("subscribe", ev);
        this.dispatchEvent(event);
      },
      onUnknown: (ev) => {
        const event = new MessageEvent(UNKNOWN, ev);
        this.dispatchEvent(event);
      },
    });

    this.messageHandler = messageHandler;
    this.#sender = createSender(socket);
  }
  connectionArc(): void {
    this.#sender.connectionArc();
  }
  next(id: string, payload: ExecutionResult): void {
    this.#sender.next(id, payload);
  }
  error(id: string, payload: GraphQLFormattedError[]): void {
    this.#sender.error(id, payload);
  }
}

type Params = { url: string | URL | WebSocket } & RequiredExecutionArgs;

export function createClient(
  { url, schema }: Readonly<Params>,
  options: Partial<PartialExecutionArgs> = {},
): Client {
  const socket = url instanceof WebSocket ? url : createWebSocket(url);
  const client = new ClientImpl(socket) as Client;

  const idMap = new Map<string, AsyncGenerator>();
  const ctx: SocketContext = {
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
