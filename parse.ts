import {
  GraphQLFormattedError,
  has,
  isPlainObject,
  isString,
  JSON,
  parseGraphQLParameters,
} from "./deps.ts";
import MessageType from "./message_type.ts";
import {
  CompleteMessage,
  ErrorMessage,
  Message,
  NextMessage,
  SubscribeMessage,
} from "./message.ts";

export default function parseMessage(
  message: unknown,
): [data: Message] | [data: undefined, error: SyntaxError | TypeError] {
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

      return [data as Message];
    }

    case MessageType.Subscribe: {
      if (!has(data, "id")) {
        return [, TypeError(`Missing field. "id"`)];
      }
      if (!isString(data.id)) {
        return [
          ,
          TypeError(
            `Invalid field. "id" must be string.`,
          ),
        ];
      }
      if (!has(data, "payload")) {
        return [, TypeError(`Missing field. "payload"`)];
      }

      const graphqlParametersResult = parseGraphQLParameters(data.payload);

      if (!graphqlParametersResult[0]) {
        return graphqlParametersResult;
      }

      return [
        { ...data, payload: graphqlParametersResult[0] } as SubscribeMessage,
      ];
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
