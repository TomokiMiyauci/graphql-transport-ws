// deno-lint-ignore-file no-explicit-any

import {
  CompleteMessage,
  ConnectionAckMessage,
  ConnectionInitMessage,
  ErrorMessage,
  MessageEventHandler,
  NextMessage,
  PingMessage,
  PongMessage,
  SubscribeMessage,
} from "./types.ts";
import { createMessageEventHandler, createSocketListener } from "./handlers.ts";
import {
  FormattedExecutionResult,
  GraphQLFormattedError,
  GraphQLRequestParameters,
  ObjMap,
} from "./deps.ts";
import {
  createWebSocket,
  Disposable,
  Dispose,
  Sender,
  SenderImpl,
} from "./utils.ts";
import { UNKNOWN } from "./constants.ts";

type CapturedCallbacks<TData = ObjMap<unknown>, TExtensions = ObjMap<unknown>> =
  {
    onNext(callback: FormattedExecutionResult<TData, TExtensions>): void;

    onError(callback: GraphQLFormattedError[]): void;

    onCompleted(): void;
  };

/** Sub-protocol of `graphql-transport-ws` event map. */
export interface GraphQLTransportWsEventMap {
  connectioninit: MessageEvent<ConnectionInitMessage>;
  connectionack: MessageEvent<ConnectionAckMessage>;
  ping: MessageEvent<PingMessage>;
  pong: MessageEvent<PongMessage>;
  subscribe: MessageEvent<SubscribeMessage>;
  next: MessageEvent<NextMessage>;
  error: MessageEvent<ErrorMessage>;
  complete: MessageEvent<CompleteMessage>;
}

/** Provides the API for `graphql-transport-ws` sending and receiving data. */
export interface GraphQLTransportWs extends EventTarget {
  /** Send `ConnectionInit` message.
   * If the connection is not yet open, sending the message is queued.
   * If the connection is closed or about to be closed, sending message will discard.
   * @see https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#connectioninit
   */
  connectionInit(payload?: Record<string, unknown>): void;

  /** Send `connectionAck` message.
   * If the connection is not yet open, sending the message is queued.
   * If the connection is closed or about to be closed, sending message will discard.
   * @see https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#connectionack
   */
  connectionAck(payload?: Record<string, unknown>): void;

  /** Send `Ping` message.
   * If the connection is not yet open, sending the message is queued.
   * If the connection is closed or about to be closed, sending message will discard.
   * @see https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#ping
   */
  ping(payload?: Record<string, unknown>): void;

  /** Send `Pong` message.
   * If the connection is not yet open, sending the message is queued.
   * If the connection is closed or about to be closed, sending message will discard.
   * @see https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#pong
   */
  pong(payload?: Record<string, unknown>): void;

  /** Send `Subscribe` message.
   * Callbacks can be registered for messages with the same subscription ID.
   * If the connection is not yet open, sending the message is queued.
   * If the connection is closed or about to be closed, sending message will discard.
   * @see https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#subscribe
   */
  subscribe(
    graphqlParams: Readonly<GraphQLRequestParameters>,
    callbacks?: Readonly<Partial<CapturedCallbacks>>,
  ): { id: string } & Disposable;

  /** Send `Next` message.
   * If the connection is not yet open, sending the message is queued.
   * If the connection is closed or about to be closed, sending message will discard.
   * @see https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#next
   */
  next(id: string, payload: FormattedExecutionResult): void;

  /** Send `Error` message.
   * If the connection is not yet open, sending the message is queued.
   * If the connection is closed or about to be closed, sending message will discard.
   * @see https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#error
   */
  error(id: string, payload: GraphQLFormattedError[]): void;

  /** Send `Complete` message.
   * If the connection is not yet open, sending the message is queued.
   * If the connection is closed or about to be closed, sending message will discard.
   * @see https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#complete
   */
  complete(id: string): void;

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

  #messageHandler: MessageEventHandler;

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

    this.#messageHandler = createMessageEventHandler({
      onConnectionInit: (ev) => {
        const event = new MessageEvent("connectioninit", ev);
        this.dispatchEvent(event);
      },
      onConnectionAck: (ev) => {
        const event = new MessageEvent("connectionack", ev);
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
      onSubscribe: (ev) => {
        const event = new MessageEvent("subscribe", ev);
        this.dispatchEvent(event);
      },
      onNext: (ev) => {
        if (this.#isAlive(ev.data.id)) {
          const customEvent = new MessageEvent("next", ev);
          this.dispatchEvent(customEvent);
        }
      },
      onComplete: (ev) => {
        const event = new MessageEvent("complete", ev);
        this.dispatchEvent(event);
      },
      onError: (ev) => {
        if (this.#isAlive(ev.data.id)) {
          const customEvent = new MessageEvent("error", ev);
          this.dispatchEvent(customEvent);
        }
      },
      onUnknown: (ev) => {
        const event = new MessageEvent(UNKNOWN, ev);
        this.dispatchEvent(event);
      },
    });
  }

  connectionInit(payload?: Record<string, unknown>): void {
    this.#sender.connectionInit(payload);
  }

  connectionAck(payload?: Record<string, unknown>): void {
    this.#sender.connectionAck(payload);
  }

  ping(payload?: Record<string, unknown>): void {
    this.#sender.ping(payload);
  }

  pong(payload?: Record<string, unknown>): void {
    this.#sender.pong(payload);
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

    const socketListener = createSocketListener({
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

    const disposeListen = socketListener(this.socket);
    const disposeSubscribeMessageSending = this.#sender.subscribe(
      id,
      graphqlParams,
    );

    const dispose: Dispose = () => {
      disposeSubscribeMessageSending?.();
      disposeListen();
    };

    return { id, dispose };
  }

  next(id: string, payload: FormattedExecutionResult): void {
    this.#sender.next(id, payload);
  }

  error(id: string, payload: GraphQLFormattedError[]): void {
    this.#sender.error(id, payload);
  }

  complete(id: string): void {
    this.#sender.complete(id);
  }

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

/** Create a providing the API for sending and receiving `graphql-transport-ws` accordance data.
 * @throws SyntaxError
 * - parsing of `url` fails
 * - `url` has a scheme other than `ws` or `wss`
 * - `url` has a fragment
 * - any of the values in `protocols` occur more than once, or otherwise fail to match the requirements for elements that comprise the value of `Sec-WebSocket-Protocol` fields as defined by the WebSocket Protocol specification
 */
export function createGraphQLTransportWs(
  url: string | URL | WebSocket,
): GraphQLTransportWs {
  const socket = url instanceof WebSocket ? url : createWebSocket(url);

  return new GraphQLTransportWsImpl(socket);
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
