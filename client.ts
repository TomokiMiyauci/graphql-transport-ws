// deno-lint-ignore-file no-explicit-any

import { CompleteMessage, PingMessage, PongMessage } from "./message.ts";
import { Sender, SenderImpl } from "./sender.ts";
import { MessageHandler } from "./types.ts";

export interface GraphQLEventMap {
  ping: MessageEvent<PingMessage>;
  pong: MessageEvent<PongMessage>;
  complete: MessageEvent<CompleteMessage>;
}

export interface GraphQL extends EventTarget {
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

  socket: WebSocket;

  addEventListener<K extends keyof GraphQLEventMap>(
    type: K,
    listener: (this: GraphQL, ev: GraphQLEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof GraphQLEventMap>(
    type: K,
    listener: (this: GraphQL, ev: GraphQLEventMap[K]) => any,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}

export interface GraphQLOptions {
  /**
   * @default false
   */
  disablePong: boolean;
}

export abstract class GraphQLImpl implements GraphQL {
  #sender: Sender;

  #eventTarget: EventTarget;

  constructor(
    public socket: WebSocket,
  ) {
    this.#eventTarget = new EventTarget();
    this.#sender = new SenderImpl(socket);
  }

  abstract messageHandler: MessageHandler;

  ping(): void {
    this.#sender.ping();
  }

  pong(): void {
    this.#sender.pong();
  }

  complete(id: string): void {
    this.#sender.complete(id);
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions | undefined,
  ): void {
    this.#eventTarget.addEventListener(type, listener, options);

    this.socket.addEventListener("message", this.messageHandler);
  }

  removeEventListener<K extends keyof GraphQLEventMap>(
    type: K,
    listener: (this: GraphQL, ev: GraphQLEventMap[K]) => any,
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
