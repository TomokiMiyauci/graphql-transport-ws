import { describe, expect, it } from "../dev_deps.ts";
import { parseMessage } from "./message.ts";

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
    it(`should return error because it is not supported`, () => {
      const result = parseMessage(JSON.stringify({
        type: "connection_ack",
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Invalid field. "type" field of "connection_ack" is not supported.`,
      );
    });
  });
  describe("[error]", () => {
    it(`should return error because it is not supported`, () => {
      const result = parseMessage(JSON.stringify({
        type: "error",
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Invalid field. "type" field of "error" is not supported.`,
      );
    });
  });
  describe("[next]", () => {
    it(`should return error because it is not supported`, () => {
      const result = parseMessage(JSON.stringify({
        type: "next",
      }));
      expect(result[0]).toBeFalsy();
      expect(result[1]).toError(
        Error,
        `Invalid field. "type" field of "next" is not supported.`,
      );
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
          variableValues: null,
          extensions: null,
          query: "query { hello }",
        },
      });
      expect(result[1]).toBeUndefined();
    });
  });
});
