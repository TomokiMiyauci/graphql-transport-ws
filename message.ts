import {
  ExecutionResult,
  GraphQLFormattedError,
  GraphQLParameters,
  GraphQLRequestParameters,
  ObjMap,
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

export interface NextMessage<
  TData = ObjMap<unknown>,
  TExtensions = ObjMap<unknown>,
> extends BaseMessage, WithId {
  type: MessageType.Next;
  payload: ExecutionResult<TData, TExtensions>;
}

export interface ErrorMessage extends BaseMessage, WithId {
  type: MessageType.Error;
  payload: GraphQLFormattedError[];
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
  static connectionAck(
    payload?: ConnectionAckMessage["payload"],
  ): ConnectionAckMessage {
    return {
      type: MessageType.ConnectionAck,
      payload,
    };
  }
  static error(
    id: ErrorMessage["id"],
    payload: ErrorMessage["payload"],
  ): ErrorMessage {
    return {
      id,
      type: MessageType.Error,
      payload,
    };
  }

  static next(
    id: NextMessage["id"],
    payload: NextMessage["payload"],
  ): NextMessage {
    return {
      id,
      type: MessageType.Next,
      payload,
    };
  }
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
  static connectionInit(
    payload?: ConnectionInitMessage["payload"],
  ): ConnectionInitMessage {
    return {
      type: MessageType.ConnectionInit,
      payload,
    };
  }

  static subscribe(
    id: string,
    payload: GraphQLRequestParameters,
  ): SubscribeMessage {
    return {
      id,
      type: MessageType.Subscribe,
      payload,
    };
  }
}
