export const PROTOCOL = "graphql-transport-ws";
export const UNKNOWN = "$$unknown";
export const DEFAULT_CONNECTION_TIMEOUT = 3_000;

export enum PrivateStatus {
  InternalServerError = 4500,
  InternalClientError = 4005,
  BadRequest = 4400,
  BadResponse = 4004,
  Unauthorized = 4401,
  Forbidden = 4403,
  SubprotocolNotAcceptable = 4406,
  ConnectionInitializationTimeout = 4408,
  ConnectionAcknowledgementTimeout = 4504,
  /** Subscriber distinction is very important */
  SubscriberAlreadyExists = 4409,
  TooManyInitializationRequests = 4429,
}

export const PRIVATE_STATUS_TEXT = {
  [PrivateStatus.Unauthorized]: `Unauthorized`,
  [PrivateStatus.ConnectionInitializationTimeout]:
    `Connection initialization timeout`,
  [PrivateStatus.SubscriberAlreadyExists]: (id: string): string =>
    `Subscriber for ${id} already exists`,
  [PrivateStatus.TooManyInitializationRequests]:
    `Too many initialization requests`,
  [PrivateStatus.BadRequest]: (message: string) => message,
};

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
