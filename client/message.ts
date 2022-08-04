import {
  CompleteMessage,
  ConnectionInitMessage,
  Messenger,
  NextMessage,
  ServerMessage,
  SubscribeMessage,
} from "../message.ts";
import MessageType from "../message_type.ts";
import {
  GraphQLParameters,
  has,
  isPlainObject,
  isString,
  JSON,
} from "../deps.ts";

export function parseMessage(
  message: unknown,
): [data: ServerMessage] | [data: undefined, error: SyntaxError | TypeError] {
  if (!isString(message)) {
    return [, TypeError("Invalid data type. Must be string.")];
  }

  const [data, error] = JSON.parse(message);

  if (error) {
    return [, error];
  }

  if (!isPlainObject(data)) {
    return [
      ,
      Error(
        `Invalid data type. Must be plain object.`,
      ),
    ];
  }

  if (!has(data, "type")) {
    return [, TypeError(`Missing field. Must include "type" field.`)];
  }
  if (!isString(data.type)) {
    return [
      ,
      TypeError(`Invalid field. "type" field of value must be string.`),
    ];
  }

  switch (data.type) {
    case MessageType.ConnectionInit:
    case MessageType.ConnectionAck:
    case MessageType.Ping:
    case MessageType.Pong: {
      if (has(data, "payload") && !isPlainObject(data.payload)) {
        return [, TypeError(`Invalid field. "payload" must be plain object.`)];
      }

      return [data as ServerMessage];
    }

    case MessageType.Next: {
      if (!has(data, "id")) {
        return [, TypeError(`Missing property. "id"`)];
      }
      if (!has(data, "payload")) {
        return [, TypeError(`Missing property. "payload"`)];
      }
      return [data as NextMessage];
    }

    case MessageType.Complete: {
      if (!has(data, "id")) {
        return [, TypeError(`Missing property. "id"`)];
      }

      return [data as CompleteMessage];
    }

    default: {
      return [
        ,
        TypeError(
          `Invalid field. "type" field of "${data.type}" is not supported.`,
        ),
      ];
    }
  }
}

export class ClientMessenger extends Messenger {
  static connectionInit(
    payload?: ConnectionInitMessage["payload"],
  ): ConnectionInitMessage {
    return {
      type: MessageType.ConnectionInit,
      payload,
    };
  }

  static subscribe(id: string, payload: GraphQLParameters): SubscribeMessage {
    return {
      id,
      type: MessageType.Subscribe,
      payload,
    };
  }
}
