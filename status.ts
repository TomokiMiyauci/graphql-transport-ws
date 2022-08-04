export enum PrivateStatus {
  InternalServerError = 4500,
  InternalClientError = 4005,
  BadRequest = 4400,
  BadResponse = 4004,
  /** Tried subscribing before connect ack */
  Unauthorized = 4401,
  Forbidden = 4403,
  SubprotocolNotAcceptable = 4406,
  ConnectionInitialisationTimeout = 4408,
  ConnectionAcknowledgementTimeout = 4504,
  /** Subscriber distinction is very important */
  SubscriberAlreadyExists = 4409,
  TooManyInitialisationRequests = 4429,
}
