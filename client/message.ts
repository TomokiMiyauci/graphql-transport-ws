import {
  CompleteMessage,
  ConnectionInitMessage,
  ErrorMessage,
  Messenger,
  NextMessage,
  ServerMessage,
  SubscribeMessage,
} from "../message.ts";
import MessageType from "../message_type.ts";
import {
  GraphQLFormattedError,
  GraphQLRequestParameters,
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

    case MessageType.Next:
    case MessageType.Error:
    case MessageType.Complete: {
      if (!has(data, "id")) {
        return [, TypeError(`Missing property. "id"`)];
      }

      switch (data.type) {
        case MessageType.Next:
        case MessageType.Error: {
          if (!has(data, "payload")) {
            return [, TypeError(`Missing property. "payload"`)];
          }

          switch (data.type) {
            case MessageType.Next: {
              return [data as NextMessage];
            }

            case MessageType.Error: {
              if (!Array.isArray(data.payload)) {
                return [
                  ,
                  TypeError(`Invalid field. "payload" must be array object.`),
                ];
              }

              try {
                data.payload.forEach(assertGraphQLFormattedError);

                return [data as ErrorMessage];
              } catch (e) {
                return [, e];
              }
            }
          }
          break;
        }
        case MessageType.Complete: {
          return [data as CompleteMessage];
        }
      }
      break;
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

function assertGraphQLFormattedError(
  value: unknown,
): asserts value is GraphQLFormattedError {
  if (!isPlainObject(value)) {
    throw TypeError(`Invalid data type. Must be plain object.`);
  }

  if (!isString(value.message)) {
    throw TypeError(`Invalid field. "message" must be string`);
  }
}
