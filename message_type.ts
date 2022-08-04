enum MessageType {
  ConnectionInit = "connection_init",
  ConnectionAck = "connection_ack",
  Ping = "ping",
  Pong = "pong",
  Subscribe = "subscribe",
  Next = "next",
  Error = "error",
  Complete = "complete",
}

export default MessageType;
