import { ClientSender, createSender } from "./sender.ts";
import { createSocketHandler } from "./handlers.ts";
import {
  ExecutionResult,
  GraphQLFormattedError,
  GraphQLRequestParameters,
  ObjMap,
} from "../deps.ts";
import { createWebSocket } from "../utils.ts";

type CapturedCallbacks<TData = ObjMap<unknown>, TExtensions = ObjMap<unknown>> =
  {
    onNext(callback: ExecutionResult<TData, TExtensions>): void;

    onError(callback: GraphQLFormattedError[]): void;

    onComplete(): void;
  };

export interface Client {
  subscribe(
    graphqlParams: Readonly<GraphQLRequestParameters>,
    callbacks: CapturedCallbacks,
  ): { id: string };

  complete(id: string): void;
}

export class ClientImpl implements Client {
  public socket: WebSocket;
  #sender: ClientSender;
  constructor(url: string | URL) {
    this.socket = createWebSocket(url);
    this.#sender = createSender(this.socket);

    this.#sender.connectionInit();
  }

  subscribe<TData = ObjMap<unknown>, TExtensions = ObjMap<unknown>>(
    graphqlParams: Readonly<GraphQLRequestParameters>,
    { onComplete, onError, onNext }: Readonly<
      Partial<CapturedCallbacks<TData, TExtensions>>
    > = {},
  ): { id: string } {
    const id = crypto.randomUUID();

    const socketHandler = createSocketHandler({
      onNext: ({ data }) => {
        if (onNext && data.id === id) {
          // deno-lint-ignore no-explicit-any
          onNext(data.payload as any);
        }
      },
      onError: ({ data }) => {
        if (onError && data.id === id) {
          onError(data.payload);
        }
      },
      onComplete: ({ data }) => {
        if (onComplete && data.id === id) {
          onComplete();
        }
      },
    });

    socketHandler(this.socket);
    this.#sender.subscribe(id, graphqlParams);

    return { id };
  }

  complete(id: string): void {
    this.#sender.complete(id);
  }
}

export function createClient(url: string | URL): Client {
  return new ClientImpl(url);
}
