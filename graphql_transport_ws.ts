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
import {
  FormattedExecutionResult,
  GraphQLFormattedError,
  GraphQLRequestParameters,
  ObjMap,
} from "./deps.ts";
import { Sender, SenderImpl } from "./utils.ts";
import { MessageType, PROTOCOL, UNKNOWN } from "./constants.ts";
import parseMessage from "./parse.ts";

type CapturedCallbacks<TData = ObjMap<unknown>, TExtensions = ObjMap<unknown>> =
  {
    onNext(
      callback: FormattedExecutionResult<TData, TExtensions>,
    ): void | Promise<void>;

    onError(callback: GraphQLFormattedError[]): void | Promise<void>;

    onComplete(): void | Promise<void>;
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

export type MessageEventHandlers = {
  /** Call on `connection_init` message. */
  onConnectionInit: MessageEventHandler<ConnectionInitMessage>;

  /** Call on `connection_ack` message. */
  onConnectionAck: MessageEventHandler<ConnectionAckMessage>;

  /** Call on `ping` message. */
  onPing: MessageEventHandler<PingMessage>;

  /** Call on `pong` message. */
  onPong: MessageEventHandler<PongMessage>;

  /** Call on `subscribe` message. */
  onSubscribe: MessageEventHandler<SubscribeMessage>;

  /** Call on `next` message. */
  onNext: MessageEventHandler<NextMessage>;

  /** Call on `error` message. */
  onError: MessageEventHandler<ErrorMessage>;

  /** Call on `complete` message. */
  onComplete: MessageEventHandler<CompleteMessage>;

  /** Call on unknown/unsupported message. */
  onUnknown: EventListener;
};

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
  ): { id: string };

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

  #eventTarget: EventTarget = new EventTarget();

  #completedIds: Set<string> = new Set();

  #messageHandler: MessageEventHandler = createMessageEventHandler(
    createMessageDispatcher.call(this, { blocklist: this.#completedIds }),
  );

  constructor(
    public socket: WebSocket,
  ) {
    this.#sender = new SenderImpl(socket);
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
    { onComplete, onError, onNext }: Readonly<
      Partial<CapturedCallbacks<TData, TExtensions>>
    > = {},
  ): { id: string } {
    const id = crypto.randomUUID();

    const nextHandler = createNextHandler(onNext, id);
    const errorHandler = createErrorHandler(onError, id);
    const completeHandler = createCompleteHandler(onComplete, id);

    const completedHandler = createCompletedHandler.call(this);
    const closeHandler = createCloseHandler.call(this);

    this.addEventListener("next", nextHandler);
    this.addEventListener("error", errorHandler);
    this.addEventListener("complete", completedHandler, { once: true });
    this.socket.addEventListener("close", closeHandler, { once: true });

    const disposeSubscribeMessageSending = this.#sender.subscribe(
      id,
      graphqlParams,
    );

    return { id };

    function createCompletedHandler(
      this: GraphQLTransportWs,
    ): MessageEventHandlers["onComplete"] {
      return async (ev) => {
        disposeSubscribeMessageSending?.();
        await completeHandler(ev);
        this.removeEventListener("next", nextHandler);
        this.removeEventListener("error", errorHandler);
      };
    }

    function createCloseHandler(this: GraphQLTransportWs): EventListener {
      return () => {
        this.removeEventListener("next", nextHandler);
        this.removeEventListener("error", errorHandler);
        this.removeEventListener("complete", completedHandler);
      };
    }
  }

  next(id: string, payload: FormattedExecutionResult): void {
    this.#sender.next(id, payload);
  }

  error(id: string, payload: GraphQLFormattedError[]): void {
    if (!this.#completedIds.has(id)) {
      this.#completedIds.add(id);
      this.#sender.error(id, payload);
    }
  }

  complete(id: string): void {
    if (!this.#completedIds.has(id)) {
      this.#completedIds.add(id);
      this.#sender.complete(id);
    }
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

/** Create `WebSocket` instance with `graphql-transport-ws` sub-protocol.  */
export function createWebSocket(url: string | URL): WebSocket {
  return new WebSocket(url, PROTOCOL);
}

function createMessageEventHandler(
  {
    onComplete,
    onConnectionAck,
    onError,
    onNext,
    onPing,
    onPong,
    onConnectionInit,
    onSubscribe,
    onUnknown,
  }: Readonly<Partial<MessageEventHandlers>> = {},
): MessageEventHandler {
  return async (ev) => {
    const [message, error] = parseMessage(ev.data);

    if (!message) {
      const event = new MessageEvent(ev.type, {
        ...ev,
        data: error.message,
      });
      await onUnknown?.(event);
      return;
    }

    const deserializedMessageEvent = new MessageEvent(ev.type, {
      ...ev,
      data: message,
    });

    const MessageTypeHandler = {
      [MessageType.ConnectionInit]: onConnectionInit,
      [MessageType.ConnectionAck]: onConnectionAck,
      [MessageType.Ping]: onPing,
      [MessageType.Pong]: onPong,
      [MessageType.Subscribe]: onSubscribe,
      [MessageType.Next]: onNext,
      [MessageType.Error]: onError,
      [MessageType.Complete]: onComplete,
    };

    return MessageTypeHandler[message.type]?.(deserializedMessageEvent);
  };
}

function createNextHandler<
  TData = ObjMap<unknown>,
  TExtensions = ObjMap<unknown>,
>(
  callback: CapturedCallbacks<TData, TExtensions>["onNext"] | undefined,
  id: string,
): MessageEventHandlers["onNext"] {
  return async ({ data }) => {
    if (data.id === id) {
      await callback?.call(null, data.payload as any);
    }
  };
}

function createErrorHandler(
  callback: CapturedCallbacks["onError"] | undefined,
  id: string,
): MessageEventHandlers["onError"] {
  return async ({ data }) => {
    if (data.id === id) {
      await callback?.call(null, data.payload);
    }
  };
}

function createCompleteHandler(
  callback: CapturedCallbacks["onComplete"] | undefined,
  id: string,
): MessageEventHandlers["onComplete"] {
  return async ({ data }) => {
    if (data.id === id) {
      await callback?.call(null);
    }
  };
}

function createMessageDispatcher(
  this: GraphQLTransportWsImpl,
  ctx: { blocklist: Set<string> },
): MessageEventHandlers {
  return {
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
      if (!ctx.blocklist.has(ev.data.id)) {
        const customEvent = new MessageEvent("next", ev);
        this.dispatchEvent(customEvent);
      }
    },
    onError: (ev) => {
      if (!ctx.blocklist.has(ev.data.id)) {
        const customEvent = new MessageEvent("error", ev);
        this.dispatchEvent(customEvent);
      }
    },
    onComplete: (ev) => {
      if (!ctx.blocklist.has(ev.data.id)) {
        ctx.blocklist.add(ev.data.id);
        const event = new MessageEvent("complete", ev);
        this.dispatchEvent(event);
      }
    },
    onUnknown: (ev) => {
      const event = new MessageEvent(UNKNOWN, ev);
      this.dispatchEvent(event);
    },
  };
}
