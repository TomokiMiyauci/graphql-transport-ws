import {
  has,
  isPlainObject,
  isString,
  JSON,
  parseGraphQLParameters,
} from "../deps.ts";
import MessageType from "../message_type.ts";
import {
  ClientMessage,
  CompleteMessage,
  ConnectionAckMessage,
  ErrorMessage,
  Messenger,
  NextMessage,
  SubscribeMessage,
} from "../message.ts";

export function parseMessage(
  message: unknown,
): [data: ClientMessage] | [data: undefined, error: SyntaxError | TypeError] {
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
    case MessageType.Ping:
    case MessageType.Pong: {
      if (has(data, "payload") && !isPlainObject(data.payload)) {
        return [, TypeError(`Invalid field. "payload" must be plain object.`)];
      }

      return [data as ClientMessage];
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

export class ServerMessenger extends Messenger {
  static connectionArc(
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
}
