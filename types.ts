import MessageType from "./message_type.ts";
import { ExecutionArgs } from "./deps.ts";

export type RequiredExecutionArgs = Pick<ExecutionArgs, "schema">;
export type PartialExecutionArgs = Omit<ExecutionArgs, "schema">;

// deno-lint-ignore no-explicit-any
export type MessageHandler<T = any> = (
  ev: MessageEvent<T>,
) => void | Promise<void>;

export type SocketHandler = (
  socket: WebSocket,
) => void | Promise<void>;

export interface BaseMessage {
  readonly type: MessageType;
}

export type WithId = {
  readonly id: string;
};
