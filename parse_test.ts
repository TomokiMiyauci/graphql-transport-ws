import { describe, expect, it } from "./dev_deps.ts";
import parseMessage from "./parse.ts";

describe("parseMessage", () => {
  it("should return error when message is not JSON format", () => {
    const result = parseMessage("");
    expect(result[0]).toBeFalsy();
    expect(result[1]).toError(
      SyntaxError,
      `Unexpected end of JSON input`,
    );
  });

  it(`should return error when message does not contain "type" field`, () => {
    const result = parseMessage(JSON.stringify({}));
    expect(result[0]).toBeFalsy();
    expect(result[1]).toError(
      Error,
      `Missing field. Must include "type" field.`,
    );
  });

  it(`should return error when message "type" is not string`, () => {
    const result = parseMessage(JSON.stringify({ type: 1 }));
    expect(result[0]).toBeFalsy();
    expect(result[1]).toError(
      Error,
      `Invalid field. "type" field of value must be string.`,
    );
  });

  it(`should return error when message "type" is unknown value`, () => {
    const result = parseMessage(JSON.stringify({ type: "test" }));
    expect(result[0]).toBeFalsy();
    expect(result[1]).toError(
      Error,
      `Invalid field. "type" field of "test" is not supported.`,
    );
  });

  describe("[connection_init]", () => {
    it(`should return error when message "payload" is not plain object`, () => {
      const result = parseMessage(JSON.stringify({
        type: "connection_init",
        payload: [],
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Invalid field. "payload" must be plain object.`,
      );
    });
    it(`should return message when message is valid`, () => {
      const result = parseMessage(JSON.stringify({
        type: "connection_init",
      }));
      expect(result[0]).toEqual({ type: "connection_init" });
      expect(result[1]).toBeUndefined();
    });
  });
  describe("[connection_ack]", () => {
    it(`should return message`, () => {
      const result = parseMessage(JSON.stringify({
        type: "connection_ack",
      }));
      expect(result[0]).toEqual({ type: "connection_ack" });
      expect(result[1]).toBeUndefined();
    });
  });
  describe("[error]", () => {
    it(`should return error when message "id" is not exists`, () => {
      const result = parseMessage(JSON.stringify({
        type: "error",
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Missing field. "id"`,
      );
    });
    it(`should return error when message "id" is not string`, () => {
      const result = parseMessage(JSON.stringify({
        type: "error",
        id: 0,
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Invalid field. "id" must be string.`,
      );
    });
    it(`should return error when message "payload" is not exists`, () => {
      const result = parseMessage(JSON.stringify({
        type: "error",
        id: "",
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Missing field. "payload"`,
      );
    });
    it(`should return error when message "payload" is not array object`, () => {
      const result = parseMessage(JSON.stringify({
        type: "error",
        id: "",
        payload: {},
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Invalid field. "payload" must be array object.`,
      );
    });
    it(`should return error when message "payload[number]" is not GraphQLFormattedError`, () => {
      const result = parseMessage(JSON.stringify({
        type: "error",
        id: "",
        payload: [1],
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Invalid data type. Must be plain object.`,
      );
    });
    it(`should return error when message "payload[number].message" is not exists`, () => {
      const result = parseMessage(JSON.stringify({
        type: "error",
        id: "",
        payload: [{}],
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Missing field. "message"`,
      );
    });
    it(`should return error when message "payload[number].message" is not string`, () => {
      const result = parseMessage(JSON.stringify({
        type: "error",
        id: "",
        payload: [{ message: 0 }],
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Invalid field. "message" must be string.`,
      );
    });
    it(`should return error when message "payload[number].locations" is not array`, () => {
      const result = parseMessage(JSON.stringify({
        type: "error",
        id: "",
        payload: [{ message: "", locations: {} }],
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Invalid field. "locations" must be array object.`,
      );
    });
    it(`should return error when message "payload[number].locations[number].line" is not exists`, () => {
      const result = parseMessage(JSON.stringify({
        type: "error",
        id: "",
        payload: [{ message: "", locations: [{}] }],
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Missing field. "line"`,
      );
    });
    it(`should return error when message "payload[number].locations[number].line" is not number`, () => {
      const result = parseMessage(JSON.stringify({
        type: "error",
        id: "",
        payload: [{ message: "", locations: [{ line: "" }] }],
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Invalid field. "line" must be number.`,
      );
    });
    it(`should return error when message "payload[number].locations[number].column" is not exists`, () => {
      const result = parseMessage(JSON.stringify({
        type: "error",
        id: "",
        payload: [{ message: "", locations: [{ line: 0 }] }],
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Missing field. "column"`,
      );
    });
    it(`should return error when message "payload[number].locations[number].column" is not number`, () => {
      const result = parseMessage(JSON.stringify({
        type: "error",
        id: "",
        payload: [{ message: "", locations: [{ line: 0, column: "" }] }],
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Invalid field. "column" must be number.`,
      );
    });
    it(`should return error when message "payload[number].locations[number].column" is not number`, () => {
      const result = parseMessage(JSON.stringify({
        type: "error",
        id: "",
        payload: [{ message: "", locations: [{ line: 0, column: "" }] }],
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Invalid field. "column" must be number.`,
      );
    });
    it(`should return error when message "payload[number].path" is not array`, () => {
      const result = parseMessage(JSON.stringify({
        type: "error",
        id: "",
        payload: [{ message: "", path: {} }],
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Invalid field. "path" must be array object.`,
      );
    });
    it(`should return error when message "payload[number].path[number]" is not string or number`, () => {
      const result = parseMessage(JSON.stringify({
        type: "error",
        id: "",
        payload: [{ message: "", path: [1, 2, "", []] }],
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Invalid field. "path[number]" must be string or number.`,
      );
    });
    it(`should return error when message "payload[number].extensions" is not plain object`, () => {
      const result = parseMessage(JSON.stringify({
        type: "error",
        id: "",
        payload: [{ message: "", extensions: [] }],
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Invalid field. "extensions" must be plain object.`,
      );
    });
    it(`should return data when message is valid`, () => {
      const result = parseMessage(JSON.stringify({
        type: "error",
        id: "",
        payload: [{
          message: "",
          locations: [{ line: 0, column: 0 }, { line: 1, column: 1 }],
          path: [1, 2, "", "a"],
          extensions: {},
        }],
      }));
      expect(result[0]).toEqual({
        type: "error",
        id: "",
        payload: [
          {
            message: "",
            locations: [{ line: 0, column: 0 }, { line: 1, column: 1 }],
            path: [1, 2, "", "a"],
            extensions: {},
          },
        ],
      });
      expect(result[1]).toBeUndefined();
    });
  });
  describe("[next]", () => {
    it(`should return error when message "id" is not exists`, () => {
      const result = parseMessage(JSON.stringify({
        type: "next",
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Missing field. "id"`,
      );
    });
    it(`should return error when message "id" is not string`, () => {
      const result = parseMessage(JSON.stringify({
        type: "next",
        id: 0,
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Invalid field. "id" must be string.`,
      );
    });
    it(`should return error when message "payload" is not exists`, () => {
      const result = parseMessage(JSON.stringify({
        type: "next",
        id: "",
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Missing field. "payload"`,
      );
    });
    it(`should return error when message "payload" is not FormattedExecutionResult`, () => {
      const result = parseMessage(JSON.stringify({
        type: "next",
        id: "",
        payload: {
          errors: [{}],
        },
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Missing field. "message"`,
      );
    });
    it(`should return data when message is valid`, () => {
      const result = parseMessage(JSON.stringify({
        type: "next",
        id: "",
        payload: {
          errors: [{ message: "" }],
          data: null,
          extensions: {},
        },
      }));
      expect(result[0]).toEqual({
        type: "next",
        id: "",
        payload: { errors: [{ message: "" }], data: null, extensions: {} },
      });
      expect(result[1]).toBeUndefined();
    });
  });
  describe("[ping]", () => {
    it(`should return error when message "payload" is not plain object`, () => {
      const result = parseMessage(JSON.stringify({
        type: "ping",
        payload: [],
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Invalid field. "payload" must be plain object.`,
      );
    });
    it(`should return message when message is valid`, () => {
      const result = parseMessage(JSON.stringify({
        type: "ping",
      }));
      expect(result[0]).toEqual({ type: "ping" });
      expect(result[1]).toBeUndefined();
    });
  });
  describe("[pong]", () => {
    it(`should return error when message "payload" is not plain object`, () => {
      const result = parseMessage(JSON.stringify({
        type: "pong",
        payload: [],
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Invalid field. "payload" must be plain object.`,
      );
    });
    it(`should return message when message is valid`, () => {
      const result = parseMessage(JSON.stringify({
        type: "pong",
      }));
      expect(result[0]).toEqual({ type: "pong" });
      expect(result[1]).toBeUndefined();
    });
  });

  describe("[subscribe]", () => {
    it(`should return error when message "id" does not contain`, () => {
      const result = parseMessage(JSON.stringify({ type: "subscribe" }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Missing field. "id"`,
      );
    });
    it(`should return error when message "id" is not string`, () => {
      const result = parseMessage(JSON.stringify({ type: "subscribe", id: 0 }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Invalid field. "id" must be string.`,
      );
    });
    it(`should return error when message "payload" does not contain`, () => {
      const result = parseMessage(
        JSON.stringify({ type: "subscribe", id: "" }),
      );
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Missing field. "payload"`,
      );
    });
    it(`should return error when message "payload" is not plain object`, () => {
      const result = parseMessage(
        JSON.stringify({ type: "subscribe", id: "", payload: 0 }),
      );
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Invalid field. "payload" must be plain object.`,
      );
    });
    it(`should return error when message "payload.query" does not include`, () => {
      const result = parseMessage(JSON.stringify({
        type: "subscribe",
        id: "",
        payload: {},
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Missing field. "query"`,
      );
    });
    it(`should return error when message "payload.query" is not string`, () => {
      const result = parseMessage(JSON.stringify({
        type: "subscribe",
        id: "",
        payload: { query: 0 },
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Invalid field. "query" must be string.`,
      );
    });
    it(`should return error when message "payload.operationName" is not string`, () => {
      const result = parseMessage(JSON.stringify({
        type: "subscribe",
        id: "",
        payload: { query: "", operationName: 0 },
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Invalid field. "operationName" must be string or null.`,
      );
    });
    it(`should return error when message "payload.variables" is not plain object`, () => {
      const result = parseMessage(JSON.stringify({
        type: "subscribe",
        id: "",
        payload: { query: "", variables: "" },
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Invalid field. "variables" must be plain object or null`,
      );
    });
    it(`should return error when message "payload.extensions" is not plain object`, () => {
      const result = parseMessage(JSON.stringify({
        type: "subscribe",
        id: "",
        payload: { query: "", extensions: "" },
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Invalid field. "extensions" must be plain object or null`,
      );
    });
    it(`should return data when message is valid format`, () => {
      const result = parseMessage(JSON.stringify({
        type: "subscribe",
        id: "",
        payload: { query: "query { hello }" },
      }));
      expect(result[0]).toEqual({
        type: "subscribe",
        id: "",
        payload: {
          operationName: null,
          variables: null,
          extensions: null,
          query: "query { hello }",
        },
      });
      expect(result[1]).toBeUndefined();
    });
    it(`should return data when message is valid format`, () => {
      const result = parseMessage(JSON.stringify({
        type: "subscribe",
        id: "",
        payload: {
          query: "query { hello }",
          variables: {
            test: null,
            test2: 0,
            test3: "",
            test4: true,
            test5: {},
          },
          operationName: "MyQuery",
          extensions: {},
        },
      }));
      expect(result[0]).toEqual({
        type: "subscribe",
        id: "",
        payload: {
          operationName: "MyQuery",
          variables: {
            test: null,
            test2: 0,
            test3: "",
            test4: true,
            test5: {},
          },
          extensions: {},
          query: "query { hello }",
        },
      });
      expect(result[1]).toBeUndefined();
    });
  });
});
