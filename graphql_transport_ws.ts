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
import {
  ADD_EVENT_LISTENER_OPTIONS,
  CLOSE,
  CONNECTIONACK,
  CONNECTIONINIT,
  MessageType,
  PROTOCOL,
  UNKNOWN,
} from "./constants.ts";
import parseMessage from "./parse.ts";

type SubscriptionCallbacks<
  TData = ObjMap<unknown>,
  TExtensions = ObjMap<unknown>,
> = {
  /** Call on `next` message filtered only tracked connection. */
  onNext(
    callback: FormattedExecutionResult<TData, TExtensions>,
  ): void | Promise<void>;

  /** Call on `error` message filtered only tracked connection. */
  onError(callback: GraphQLFormattedError[]): void | Promise<void>;

  /** Call on `complete` message filtered only tracked connection. */
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

/** Provides the API for `graphql-transport-ws` sending and receiving data.
 * @throws SyntaxError
 * - parsing of `url` fails
 * - `url` has a scheme other than `ws` or `wss`
 * - `url` has a fragment
 * - any of the values in `protocols` occur more than once, or otherwise fail to match the requirements for elements that comprise the value of `Sec-WebSocket-Protocol` fields as defined by the WebSocket Protocol specification
 */
export class GraphQLTransportWs implements EventTarget {
  #sender: Sender;
  #eventTarget: EventTarget = new EventTarget();
  #completedIds: Set<string> = new Set();
  #messageHandler: MessageEventHandler = createMessageEventHandler(
    createMessageDispatcher.call(this, { blocklist: this.#completedIds }),
  );
  #closeHandler: EventListener;

  /** WebSocket itself. */
  socket: WebSocket;

  constructor(
    /** The URL to which to connect; this should be the URL to which the WebSocket server will respond.
     * Or WebSocket itself.
     */
    urlOrSocket: string | URL | WebSocket,
  ) {
    this.socket = isWebSocket(urlOrSocket)
      ? urlOrSocket
      : createWebSocket(urlOrSocket);
    this.#sender = new SenderImpl(this.socket);
    function closeHandler(this: GraphQLTransportWs): void {
      this.socket.removeEventListener("message", this.#messageHandler);
    }

    this.#closeHandler = closeHandler.bind(this);
  }

  onconnectioninit:
    | ((
      this: GraphQLTransportWs,
      ev: MessageEvent<ConnectionInitMessage>,
    ) => any)
    | null = null;

  onconnectionack:
    | ((
      this: GraphQLTransportWs,
      ev: MessageEvent<ConnectionAckMessage>,
    ) => any)
    | null = null;

  onping:
    | ((
      this: GraphQLTransportWs,
      ev: MessageEvent<PingMessage>,
    ) => any)
    | null = null;

  onpong:
    | ((
      this: GraphQLTransportWs,
      ev: MessageEvent<ConnectionAckMessage>,
    ) => any)
    | null = null;

  onsubscribe:
    | ((this: GraphQLTransportWs, ev: MessageEvent<SubscribeMessage>) => any)
    | null = null;

  onnext:
    | ((this: GraphQLTransportWs, ev: MessageEvent<NextMessage>) => any)
    | null = null;

  onerror:
    | ((this: GraphQLTransportWs, ev: MessageEvent<ErrorMessage>) => any)
    | null = null;

  oncomplete:
    | ((
      this: GraphQLTransportWs,
      ev: MessageEvent<CompleteMessage>,
    ) => any)
    | null = null;

  /** Send `ConnectionInit` message.
   * If the connection is not yet open, sending the message is queued.
   * If the connection is closed or about to be closed, sending message will discard.
   * @see https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#connectioninit
   */
  connectionInit(payload?: Record<string, unknown>): void {
    this.#sender.connectionInit(payload);
  }

  /** Send `connectionAck` message.
   * If the connection is not yet open, sending the message is queued.
   * If the connection is closed or about to be closed, sending message will discard.
   * @see https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#connectionack
   */
  connectionAck(payload?: Record<string, unknown>): void {
    this.#sender.connectionAck(payload);
  }

  /** Send `Ping` message.
   * If the connection is not yet open, sending the message is queued.
   * If the connection is closed or about to be closed, sending message will discard.
   * @see https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#ping
   */
  ping(payload?: Record<string, unknown>): void {
    this.#sender.ping(payload);
  }

  /** Send `Pong` message.
   * If the connection is not yet open, sending the message is queued.
   * If the connection is closed or about to be closed, sending message will discard.
   * @see https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#pong
   */
  pong(payload?: Record<string, unknown>): void {
    this.#sender.pong(payload);
  }

  /** Send `Subscribe` message.
   * Callbacks can be registered for messages with the same subscription ID.
   * If the connection is not yet open, sending the message is queued.
   * If the connection is closed or about to be closed, sending message will discard.
   * @see https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#subscribe
   */
  subscribe<TData = ObjMap<unknown>, TExtensions = ObjMap<unknown>>(
    graphqlParams: Readonly<GraphQLRequestParameters>,
    { onComplete, onError, onNext }: Readonly<
      Partial<SubscriptionCallbacks<TData, TExtensions>>
    > = {},
  ): { id: string } {
    const id = crypto.randomUUID();

    const nextHandler = createNextHandler(onNext, id);
    const errorHandler = createErrorHandler(onError, id);
    const completeHandler = createCompleteHandler(onComplete, id);

    const completedHandler = createCompletedHandler.call(this);
    const closeHandler = createCloseHandler.call(this);

    this.addEventListener(MessageType.Next, nextHandler);
    this.addEventListener(MessageType.Error, errorHandler);
    this.addEventListener(
      MessageType.Complete,
      completedHandler,
      ADD_EVENT_LISTENER_OPTIONS,
    );
    this.socket.addEventListener(
      CLOSE,
      closeHandler,
      ADD_EVENT_LISTENER_OPTIONS,
    );

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
        this.removeEventListener(MessageType.Next, nextHandler);
        this.removeEventListener(MessageType.Error, errorHandler);
      };
    }

    function createCloseHandler(this: GraphQLTransportWs): EventListener {
      return () => {
        this.removeEventListener(MessageType.Next, nextHandler);
        this.removeEventListener(MessageType.Error, errorHandler);
        this.removeEventListener(MessageType.Complete, completedHandler);
      };
    }
  }

  /** Send `Next` message.
   * If the connection is not yet open, sending the message is queued.
   * If the connection is closed or about to be closed, sending message will discard.
   * @see https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#next
   */
  next(id: string, payload: FormattedExecutionResult): void {
    this.#sender.next(id, payload);
  }

  /** Send `Error` message.
   * If the connection is not yet open, sending the message is queued.
   * If the connection is closed or about to be closed, sending message will discard.
   * @see https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#error
   */
  error(id: string, payload: GraphQLFormattedError[]): void {
    if (!this.#completedIds.has(id)) {
      this.#completedIds.add(id);
      this.#sender.error(id, payload);
    }
  }

  /** Send `Complete` message.
   * If the connection is not yet open, sending the message is queued.
   * If the connection is closed or about to be closed, sending message will discard.
   * @see https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#complete
   */
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
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void {
    this.#eventTarget.addEventListener(type, listener, options);

    this.socket.addEventListener("message", this.#messageHandler);
    this.socket.addEventListener(
      CLOSE,
      this.#closeHandler,
      ADD_EVENT_LISTENER_OPTIONS,
    );
  }

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
  callback: SubscriptionCallbacks<TData, TExtensions>["onNext"] | undefined,
  id: string,
): MessageEventHandlers["onNext"] {
  return async ({ data }) => {
    if (data.id === id) {
      await callback?.call(null, data.payload as any);
    }
  };
}

function createErrorHandler(
  callback: SubscriptionCallbacks["onError"] | undefined,
  id: string,
): MessageEventHandlers["onError"] {
  return async ({ data }) => {
    if (data.id === id) {
      await callback?.call(null, data.payload);
    }
  };
}

function createCompleteHandler(
  callback: SubscriptionCallbacks["onComplete"] | undefined,
  id: string,
): MessageEventHandlers["onComplete"] {
  return async ({ data }) => {
    if (data.id === id) {
      await callback?.call(null);
    }
  };
}

function createMessageDispatcher(
  this: GraphQLTransportWs,
  ctx: { blocklist: Set<string> },
): MessageEventHandlers {
  return {
    onConnectionInit: async (ev) => {
      const event = new MessageEvent(CONNECTIONINIT, ev);
      this.dispatchEvent(event);
      await this.onconnectioninit?.(event);
    },
    onConnectionAck: async (ev) => {
      const event = new MessageEvent(CONNECTIONACK, ev);
      this.dispatchEvent(event);
      await this.onconnectionack?.(event);
    },
    onPing: async (ev) => {
      const event = new MessageEvent(MessageType.Ping, ev);
      this.dispatchEvent(event);
      await this.onping?.(event);
    },
    onPong: async (ev) => {
      const event = new MessageEvent(MessageType.Pong, ev);
      this.dispatchEvent(event);
      await this.onpong?.(event);
    },
    onSubscribe: async (ev) => {
      const event = new MessageEvent(MessageType.Subscribe, ev);
      this.dispatchEvent(event);
      await this.onsubscribe?.(event);
    },
    onNext: async (ev) => {
      if (!ctx.blocklist.has(ev.data.id)) {
        const event = new MessageEvent(MessageType.Next, ev);
        this.dispatchEvent(event);
        await this.onnext?.(event);
      }
    },
    onError: async (ev) => {
      if (!ctx.blocklist.has(ev.data.id)) {
        const event = new MessageEvent(MessageType.Error, ev);
        this.dispatchEvent(event);
        await this.onerror?.(event);
      }
    },
    onComplete: async (ev) => {
      if (!ctx.blocklist.has(ev.data.id)) {
        ctx.blocklist.add(ev.data.id);
        const event = new MessageEvent(MessageType.Complete, ev);
        this.dispatchEvent(event);
        await this.oncomplete?.(event);
      }
    },
    onUnknown: (ev) => {
      const event = new MessageEvent(UNKNOWN, ev);
      this.dispatchEvent(event);
    },
  };
}

/** Whether the value is instance of `WebSocket` or not. */
export function isWebSocket(value: unknown): value is WebSocket {
  return value instanceof WebSocket;
}
