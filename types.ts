import { MessageType } from "./constants.ts";
import {
  ExecutionArgs,
  ExecutionResult,
  GraphQLFormattedError,
  GraphQLParameters,
  ObjMap,
  PartialBy,
} from "./deps.ts";

export type RequiredExecutionArgs = Pick<ExecutionArgs, "schema">;
export type PartialExecutionArgs = Omit<ExecutionArgs, "schema">;

/** Handler for `MessageEvent`. */
// deno-lint-ignore no-explicit-any
export type MessageEventHandler<T = any> = (
  ev: MessageEvent<T>,
) => void | Promise<void>;

export type SocketHandler = (
  socket: WebSocket,
) => void | Promise<void>;

export type GraphQLArgs = PartialBy<ExecutionArgs, "document">;

interface BaseMessage {
  readonly type: MessageType;
}

type WithId = {
  readonly id: string;
};

export type PartialGraphQLParameters = PartialBy<
  GraphQLParameters,
  keyof Omit<GraphQLParameters, "query">
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
