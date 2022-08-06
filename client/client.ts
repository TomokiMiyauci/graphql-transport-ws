// deno-lint-ignore-file no-explicit-any
import { ClientSender, createSender } from "./sender.ts";
import {
  createMessageHandler,
  createSocketHandler,
  GraphQLClientEventMap,
} from "./handlers.ts";
import {
  ExecutionResult,
  GraphQLFormattedError,
  GraphQLRequestParameters,
  ObjMap,
} from "../deps.ts";
import { createWebSocket, Disposable, Dispose } from "../utils.ts";
import { GraphQL, GraphQLImpl, GraphQLOptions } from "../client.ts";
import { MessageHandler } from "../types.ts";
import { createPingHandler } from "../handlers.ts";

type CapturedCallbacks<TData = ObjMap<unknown>, TExtensions = ObjMap<unknown>> =
  {
    onNext(callback: ExecutionResult<TData, TExtensions>): void;

    onError(callback: GraphQLFormattedError[]): void;

    onCompleted(): void;
  };

interface GraphQLClientOptions extends GraphQLOptions {
  disableConnectionInit: boolean;
}

export interface GraphQLClient extends GraphQL {
  /** Send `ConnectionInit` message.
   * If the connection is not yet open, sending the message is delayed.
   * If the connection is closed or about to be closed, sending message is discarded.
   * @see https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#connectioninit
   */
  connectionInit(): void;

  subscribe(
    graphqlParams: Readonly<GraphQLRequestParameters>,
    callbacks?: Partial<CapturedCallbacks>,
  ): { id: string } & Disposable;

  /** Send `Complete` message.
   * If the connection is not yet open, sending the message is delayed.
   * If the connection is closed or about to be closed, sending message is discarded.
   * @see https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#complete
   */
  complete(id: string): void;

  addEventListener<K extends keyof GraphQLClientEventMap>(
    type: K,
    listener: (this: GraphQLClient, ev: GraphQLClientEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof GraphQLClientEventMap>(
    type: K,
    listener: (this: GraphQLClient, ev: GraphQLClientEventMap[K]) => any,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}

export class ClientImpl extends GraphQLImpl {
  #sender: ClientSender;

  /** Memory completed subscription ids. */
  #idMap: ExpandedMap<string, (() => void) | undefined> = new ExpandedMap<
    string,
    (() => void) | undefined
  >();

  constructor(
    socket: WebSocket,
  ) {
    super(socket);
    this.#sender = createSender(socket);
  }

  messageHandler: MessageHandler<any> = createMessageHandler({
    onComplete: (ev) => {
      const customEvent = new MessageEvent("complete", ev);
      this.dispatchEvent(customEvent);
    },
    onConnectionArc: (ev) => {
      const customEvent = new MessageEvent("connectionarc", ev);
      this.dispatchEvent(customEvent);
    },
    onPing: (ev) => {
      const customEvent = new MessageEvent("ping", ev);
      this.dispatchEvent(customEvent);
    },
    onPong: (ev) => {
      const customEvent = new MessageEvent("pong", ev);
      this.dispatchEvent(customEvent);
    },
    onNext: (ev) => {
      if (this.#isAlive(ev.data.id)) {
        const customEvent = new MessageEvent("next", ev);
        this.dispatchEvent(customEvent);
      }
    },
    onError: (ev) => {
      if (this.#isAlive(ev.data.id)) {
        const customEvent = new MessageEvent("error", ev);
        this.dispatchEvent(customEvent);
      }
    },
  });

  connectionInit() {
    this.#sender.connectionInit();
  }

  subscribe<TData = ObjMap<unknown>, TExtensions = ObjMap<unknown>>(
    graphqlParams: Readonly<GraphQLRequestParameters>,
    { onCompleted, onError, onNext }: Readonly<
      Partial<CapturedCallbacks<TData, TExtensions>>
    > = {},
  ): { id: string } & Disposable {
    const id = crypto.randomUUID();

    this.#idMap.set(id, onCompleted);

    function isReceivable(this: ClientImpl, fromId: string): boolean {
      return id === fromId && this.#isAlive(id);
    }

    const socketHandler = createSocketHandler({
      onNext: ({ data }) => {
        if (onNext && isReceivable.call(this, data.id)) {
          onNext(data.payload as any);
        }
      },
      onError: ({ data }) => {
        if (onError && isReceivable.call(this, data.id)) {
          onError(data.payload);
        }
      },
      onComplete: ({ data: { id } }) => {
        this.#idMap.deleteThen(id, (v) => {
          this.#sender.complete(id);
          v?.();
        });
      },
    });

    const disposeSocket = socketHandler(this.socket);
    const disposeSubscribeMessageSending = this.#sender.subscribe(
      id,
      graphqlParams,
    );

    const dispose: Dispose = () => {
      disposeSubscribeMessageSending?.();
      disposeSocket();
    };

    return { id, dispose };
  }

  complete(id: string): void {
    this.#idMap.deleteThen(id, (v) => {
      this.#sender.complete(id);
      v?.();
    });
  }

  #isAlive(id: string): boolean {
    return this.#idMap.has(id);
  }
}

export function createClient(
  url: string | URL,
  { disableConnectionInit }: Readonly<Partial<GraphQLClientOptions>> = {},
): GraphQLClient {
  const socket = createWebSocket(url);
  const client = new ClientImpl(socket) as GraphQLClient;

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

class ExpandedMap<K, V> extends Map<K, V> {
  constructor() {
    super();
  }

  deleteThen(key: K, fn: (value: V) => void) {
    if (this.has(key)) {
      const value = this.get(key)!;
      this.delete(key);
      fn(value);
    }
  }
}
