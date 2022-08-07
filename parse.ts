import {
  FormattedExecutionResult,
  GraphQLFormattedError,
  has,
  isNumber,
  isPlainObject,
  isString,
  JSON,
  parseGraphQLParameters,
  SourceLocation,
} from "./deps.ts";
import {
  CompleteMessage,
  ErrorMessage,
  Message,
  NextMessage,
  SubscribeMessage,
} from "./types.ts";
import { MessageType } from "./constants.ts";

/** Parse the value as `graphql-transport-ws` message.
 * @param message Any value.
 * ```ts
 * import { parseMessage, MessageType } from "https://deno.land/x/graphql_transport_ws@$VERSION/mod.ts";
 * import { assertEquals } from "https://deno.land/std@$VERSION/testing/asserts.ts"
 * const ev = new MessageEvent("message", {
 *   data: JSON.stringify({
 *     type: "pong"
 *   }),
 * });
 * const result = parseMessage(ev.data)
 * assertEquals(result[0], {'type': MessageType.Pong })
 * assertEquals(result[1], undefined)
 * ```
 */
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

    case MessageType.Subscribe:
    case MessageType.Next:
    case MessageType.Error:
    case MessageType.Complete: {
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

      switch (data.type) {
        case MessageType.Subscribe:
        case MessageType.Next:
        case MessageType.Error: {
          if (!has(data, "payload")) {
            return [, TypeError(`Missing field. "payload"`)];
          }

          switch (data.type) {
            case MessageType.Subscribe: {
              const graphqlParametersResult = parseGraphQLParameters(
                data.payload,
              );

              if (!graphqlParametersResult[0]) {
                return graphqlParametersResult;
              }

              return [
                {
                  ...data,
                  payload: graphqlParametersResult[0],
                } as SubscribeMessage,
              ];
            }
            case MessageType.Next: {
              try {
                assertFormattedExecutionResult(data.payload);
                return [data as NextMessage];
              } catch (e) {
                return [, e];
              }
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

  if (!has(value, "message")) {
    throw TypeError(`Missing field. "message"`);
  }

  if (!isString(value.message)) {
    throw TypeError(`Invalid field. "message" must be string.`);
  }

  if (has(value, "locations")) {
    if (!Array.isArray(value.locations)) {
      throw TypeError(`Invalid field. "locations" must be array object.`);
    }

    value.locations.map(assertSourceLocation);
  }

  if (has(value, "path")) {
    if (!Array.isArray(value.path)) {
      throw TypeError(`Invalid field. "path" must be array object.`);
    }
    value.path.map((value) => {
      if (!isString(value) && !isNumber(value)) {
        throw TypeError(
          `Invalid field. "path[number]" must be string or number.`,
        );
      }
    });
  }
  if (has(value, "extensions")) {
    if (!isPlainObject(value.extensions)) {
      throw TypeError(`Invalid field. "extensions" must be plain object.`);
    }
  }
}

function assertSourceLocation(value: unknown): asserts value is SourceLocation {
  if (!isPlainObject(value)) {
    throw TypeError(`Invalid data type. Must be plain object.`);
  }

  if (!has(value, "line")) {
    throw TypeError(`Missing field. "line"`);
  }

  if (!isNumber(value.line)) {
    throw TypeError(`Invalid field. "line" must be number.`);
  }
  if (!has(value, "column")) {
    throw TypeError(`Missing field. "column"`);
  }

  if (!isNumber(value.column)) {
    throw TypeError(`Invalid field. "column" must be number.`);
  }
}

export function assertFormattedExecutionResult(
  value: unknown,
): asserts value is FormattedExecutionResult {
  if (!isPlainObject(value)) {
    throw TypeError(`Invalid data type. Must be plain object.`);
  }
  if (has(value, "errors")) {
    if (!Array.isArray(value.errors)) {
      throw TypeError(`Invalid field. "errors" must be array object.`);
    }
    value.errors.map(assertGraphQLFormattedError);
  }
}
