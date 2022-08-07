export const PROTOCOL = "graphql-transport-ws";
export const UNKNOWN = "$$unknown";
export const DEFAULT_CONNECTION_TIMEOUT = 3_000;

export const CONNECTIONINIT = "connectioninit";
export const CONNECTIONACK = "connectionack";

/** WebSocket private status code. */
export enum Status {
  InternalServerError = 4500,
  InternalClientError = 4005,
  BadRequest = 4400,
  BadResponse = 4004,
  Unauthorized = 4401,
  Forbidden = 4403,
  SubprotocolNotAcceptable = 4406,
  ConnectionInitializationTimeout = 4408,
  ConnectionAcknowledgementTimeout = 4504,
  SubscriberAlreadyExists = 4409,
  TooManyInitializationRequests = 4429,
}

/** A record of all the private status codes text. */
export const STATUS_TEXT = {
  [Status.Unauthorized]: `Unauthorized`,
  [Status.ConnectionInitializationTimeout]: `Connection initialization timeout`,
  [Status.SubscriberAlreadyExists]: (id: string): string =>
    `Subscriber for ${id} already exists`,
  [Status.TooManyInitializationRequests]: `Too many initialization requests`,
  [Status.BadRequest]: (message: string) => message,
};

/** Message type. */
export enum MessageType {
  ConnectionInit = "connection_init",
  ConnectionAck = "connection_ack",
  Ping = "ping",
  Pong = "pong",
  Subscribe = "subscribe",
  Next = "next",
  Error = "error",
  Complete = "complete",
}
