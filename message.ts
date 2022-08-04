import {
  ExecutionResult,
  GraphQLError,
  GraphQLParameters,
  PartialBy,
} from "./deps.ts";
import MessageType from "./message_type.ts";

interface BaseMessage {
  readonly type: MessageType;
}

type WithId = {
  readonly id: string;
};

type PartialGraphQLParameter = keyof Omit<GraphQLParameters, "query">;
export type PartialGraphQLParameters = PartialBy<
  GraphQLParameters,
  PartialGraphQLParameter
>;

export interface ConnectionInitMessage extends BaseMessage {
  type: MessageType.ConnectionInit;

  payload?: Record<string, unknown>;
}

export interface ConnectionAckMessage extends BaseMessage {
  type: MessageType.ConnectionAck;

  payload?: Record<string, unknown>;
}

export interface PingMessage extends BaseMessage {
  type: MessageType.Ping;
  payload?: Record<string, unknown>;
}

export interface PongMessage extends BaseMessage {
  type: MessageType.Pong;
  payload?: Record<string, unknown>;
}

export interface SubscribeMessage extends BaseMessage, WithId {
  type: MessageType.Subscribe;
  payload: Readonly<PartialGraphQLParameters>;
}

export interface NextMessage extends BaseMessage, WithId {
  type: MessageType.Next;
  payload: ExecutionResult;
}

export interface ErrorMessage extends BaseMessage, WithId {
  type: MessageType.Error;
  payload: readonly GraphQLError[];
}

export interface CompleteMessage extends BaseMessage, WithId {
  type: MessageType.Complete;
}

export type BidirectionalMessage = PingMessage | PongMessage | CompleteMessage;

export type ClientMessage =
  | BidirectionalMessage
  | ConnectionInitMessage
  | SubscribeMessage;

export type ServerMessage =
  | BidirectionalMessage
  | ConnectionAckMessage
  | NextMessage
  | ErrorMessage;

export type Message =
  | ClientMessage
  | ServerMessage;

export class Messenger {
  static ping(payload?: PingMessage["payload"]): PingMessage {
    return {
      type: MessageType.Ping,
      payload,
    };
  }
  static pong(payload?: PongMessage["payload"]): PongMessage {
    return {
      type: MessageType.Pong,
      payload,
    };
  }
  static complete(id: CompleteMessage["id"]): CompleteMessage {
    return {
      id,
      type: MessageType.Complete,
    };
  }
}
