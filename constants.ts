export const PROTOCOL = "graphql-transport-ws";
export const UNKNOWN = "$$unknown";
export const DEFAULT_CONNECTION_TIMEOUT = 3_000;

export const CONNECTIONINIT = "connectioninit";
export const CONNECTIONACK = "connectionack";

/** WebSocket private status code. */
export enum Status {
  /** GraphQL over WebSocket Protocol - Invalid message
   * @see [Invalid message](https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#invalid-message) */
  BadRequest = 4400,

  /** GraphQL over WebSocket Protocol - Subscribe
   * @see [Subscribe](https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#subscribe)
   */
  Unauthorized = 4401,

  SubprotocolNotAcceptable = 4406,

  /** GraphQL over WebSocket Protocol - Connection initialization timeout
   * @see [Connection initialization timeout](https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#connection-initialisation-timeout)
   */
  ConnectionInitializationTimeout = 4408,

  /** GraphQL over WebSocket Protocol - Subscribe
   * @see [Subscribe](https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#subscribe)
   */
  SubscriberAlreadyExists = 4409,

  /** GraphQL over WebSocket Protocol - ConnectionInit
   * @see [ConnectionInit](https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#connectioninit)
   */
  TooManyInitializationRequests = 4429,
}

/** A record of all the private status codes text. */
export const STATUS_TEXT = {
  [Status.BadRequest]: (message: string) => message,
  [Status.Unauthorized]: `Unauthorized`,
  [Status.SubprotocolNotAcceptable]: `Subprotocol not acceptable`,
  [Status.ConnectionInitializationTimeout]: `Connection initialization timeout`,
  [Status.SubscriberAlreadyExists]: (id: string): string =>
    `Subscriber for ${id} already exists`,
  [Status.TooManyInitializationRequests]: `Too many initialization requests`,
};

/** Message type. */
export enum MessageType {
  /**
   * @see [ConnectionInit](https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#connectioninit)
   */
  ConnectionInit = "connection_init",

  /**
   * @see [ConnectionAck](https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#connectionack)
   */
  ConnectionAck = "connection_ack",

  /**
   * @see [Ping](https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#ping)
   */
  Ping = "ping",

  /**
   * @see [Pong](https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#pong)
   */
  Pong = "pong",

  /**
   * @see [Subscribe](https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#subscribe)
   */
  Subscribe = "subscribe",

  /**
   * @see [Next](https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#next)
   */
  Next = "next",

  /**
   * @see [Error](https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#next)
   */
  Error = "error",

  /**
   * @see [Complete](https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md#next)
   */
  Complete = "complete",
}
