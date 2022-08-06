import { ClientSender, createSender } from "./sender.ts";
import {
  createMessageHandler,
  createSocketHandler,
  GraphQLEventMap,
} from "./handlers.ts";
import {
  ExecutionResult,
  GraphQLFormattedError,
  GraphQLRequestParameters,
  ObjMap,
} from "../deps.ts";
import { createWebSocket, Disposable, Dispose } from "../utils.ts";

type CapturedCallbacks<TData = ObjMap<unknown>, TExtensions = ObjMap<unknown>> =
  {
    onNext(callback: ExecutionResult<TData, TExtensions>): void;

    onError(callback: GraphQLFormattedError[]): void;

    onCompleted(): void;
  };

export interface GraphQLClient extends EventTarget {
  ping(): void;

  pong(): void;

  connectionInit(): void;

  subscribe(
    graphqlParams: Readonly<GraphQLRequestParameters>,
    callbacks?: Partial<CapturedCallbacks>,
  ): { id: string } & Disposable;

  complete(id: string): void;

  socket: WebSocket;

  addEventListener<K extends keyof GraphQLEventMap>(
    type: K,
    // deno-lint-ignore no-explicit-any
    listener: (this: GraphQLClient, ev: GraphQLEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
}

export class ClientImpl extends EventTarget implements GraphQLClient {
  public socket: WebSocket;
  #sender: ClientSender;

  /** Memory completed subscription ids. */
  #idMap: ExpandedMap<string, (() => void) | undefined>;
  constructor(url: string | URL) {
    super();

    this.socket = createWebSocket(url);
    this.#sender = createSender(this.socket);
    this.#idMap = new ExpandedMap<string, (() => void) | undefined>();

    const messageHandler = createMessageHandler({
      onComplete: (ev) => {
        const customEvent = new MessageEvent("complete", ev);
        this.dispatchEvent(customEvent);
      },
      onConnectionArc: (ev) => {
        const customEvent = new MessageEvent("connection_arc", ev);
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
        const customEvent = new MessageEvent("next", ev);
        this.dispatchEvent(customEvent);
      },
      onError: (ev) => {
        const customEvent = new MessageEvent("error", ev);
        this.dispatchEvent(customEvent);
      },
    });

    this.socket.addEventListener("message", (ev) => {
      messageHandler(ev);
    });

    this.#sender.connectionInit();
  }

  ping(): void {
    this.#sender.ping();
  }

  pong(): void {
    this.#sender.pong();
  }

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
      return id === fromId && this.#idMap.has(id);
    }

    const socketHandler = createSocketHandler({
      onNext: ({ data }) => {
        if (onNext && isReceivable.call(this, data.id)) {
          // deno-lint-ignore no-explicit-any
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
}

export function createClient(url: string | URL): GraphQLClient {
  return new ClientImpl(url);
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
