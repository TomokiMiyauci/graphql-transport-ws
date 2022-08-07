// deno-lint-ignore-file no-explicit-any

import {
  CompleteMessage,
  ConnectionAckMessage,
  ConnectionInitMessage,
  ErrorMessage,
  MessageHandler,
  NextMessage,
  PingMessage,
  PongMessage,
  SubscribeMessage,
} from "./types.ts";
import { createMessageHandler, createSocketHandler } from "./handlers.ts";
import {
  ExecutionResult,
  GraphQLFormattedError,
  GraphQLRequestParameters,
  ObjMap,
} from "./deps.ts";
import { Disposable, Dispose, Sender, SenderImpl } from "./utils.ts";
import { UNKNOWN } from "./constants.ts";

type CapturedCallbacks<TData = ObjMap<unknown>, TExtensions = ObjMap<unknown>> =
  {
    onNext(callback: ExecutionResult<TData, TExtensions>): void;

    onError(callback: GraphQLFormattedError[]): void;

    onCompleted(): void;
  };

export interface GraphQLTransportWsEventMap {
  connectioninit: MessageEvent<ConnectionInitMessage>;
  connectionack: MessageEvent<ConnectionAckMessage>;
  ping: MessageEvent<PingMessage>;
  pong: MessageEvent<PongMessage>;
  subscribe: MessageEvent<SubscribeMessage>;
  complete: MessageEvent<CompleteMessage>;
  next: MessageEvent<NextMessage>;
  error: MessageEvent<ErrorMessage>;
}

export interface GraphQLTransportWs extends EventTarget {
  /** Send `Ping` message.
   * If the connection is not yet open, sending the message is delayed.
   * If the connection is closed or about to be closed, sending message is discarded.
   * @see https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#ping
   */
  ping(): void;

  /** Send `Pong` message.
   * If the connection is not yet open, sending the message is delayed.
   * If the connection is closed or about to be closed, sending message is discarded.
   * @see https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#pong
   */
  pong(): void;

  /** Send `Complete` message.
   * If the connection is not yet open, sending the message is delayed.
   * If the connection is closed or about to be closed, sending message is discarded.
   * @see https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#complete
   */
  complete(id: string): void;

  connectionAck(): void;
  next(id: string, payload: ExecutionResult): void;
  error(id: string, payload: GraphQLFormattedError[]): void;

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

  socket: WebSocket;

  addEventListener<K extends keyof GraphQLTransportWsEventMap>(
    type: K,
    listener: (
      this: GraphQLTransportWs,
      ev: GraphQLTransportWsEventMap[K],
    ) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof GraphQLTransportWsEventMap>(
    type: K,
    listener: (
      this: GraphQLTransportWs,
      ev: GraphQLTransportWsEventMap[K],
    ) => any,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}

export class GraphQLTransportWsImpl implements GraphQLTransportWs {
  #sender: Sender;

  #eventTarget: EventTarget;

  #messageHandler: MessageHandler;

  /** Memory completed subscription ids. */
  #idMap: ExpandedMap<string, (() => void) | undefined> = new ExpandedMap<
    string,
    (() => void) | undefined
  >();

  constructor(
    public socket: WebSocket,
  ) {
    this.#eventTarget = new EventTarget();
    this.#sender = new SenderImpl(socket);

    this.#messageHandler = createMessageHandler({
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
  }

  ping(): void {
    this.#sender.ping();
  }

  pong(): void {
    this.#sender.pong();
  }

  complete(id: string): void {
    this.#sender.complete(id);
  }

  connectionAck(): void {
    this.#sender.connectionAck();
  }
  next(id: string, payload: ExecutionResult): void {
    this.#sender.next(id, payload);
  }
  error(id: string, payload: GraphQLFormattedError[]): void {
    this.#sender.error(id, payload);
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

    function isReceivable(
      this: GraphQLTransportWsImpl,
      fromId: string,
    ): boolean {
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

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions | undefined,
  ): void {
    this.#eventTarget.addEventListener(type, listener, options);

    this.socket.addEventListener("message", this.#messageHandler);
  }

  removeEventListener<K extends keyof GraphQLTransportWsEventMap>(
    type: K,
    listener: (
      this: GraphQLTransportWsImpl,
      ev: GraphQLTransportWsEventMap[K],
    ) => any,
    options?: boolean | EventListenerOptions | undefined,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions | undefined,
  ): void {
    this.#eventTarget.removeEventListener(type, listener, options);
  }

  dispatchEvent(event: Event): boolean {
    return this.#eventTarget.dispatchEvent(event);
  }

  #isAlive(id: string): boolean {
    return this.#idMap.has(id);
  }
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
