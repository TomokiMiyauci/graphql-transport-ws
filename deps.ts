export {
  isAsyncIterable,
  isPlainObject,
  isString,
} from "https://deno.land/x/isx@1.0.0-beta.19/mod.ts";
export { JSON } from "https://deno.land/x/pure_json@1.0.0-beta.1/mod.ts";
export {
  type DocumentNode,
  execute,
  type ExecutionArgs,
  type ExecutionResult,
  getOperationAST,
  GraphQLError,
  type GraphQLFormattedError,
  GraphQLSchema,
  OperationTypeNode,
  parse,
  subscribe,
  validate,
} from "https://esm.sh/graphql@16.5.0";
export { type ObjMap } from "https://esm.sh/v89/graphql@16.5.0/jsutils/ObjMap";
export {
  type GraphQLParameters,
  parseGraphQLParameters,
} from "https://deno.land/x/graphql_http@1.0.0-beta.17/mod.ts";
import { GraphQLParameters } from "https://deno.land/x/graphql_http@1.0.0-beta.17/mod.ts";
import { type ExecutionResult } from "https://esm.sh/graphql@16.5.0";
// deno-lint-ignore no-explicit-any
export function has<T extends Record<any, any>, K extends string>(
  value: T,
  key: K,
): value is T & Record<K, unknown> {
  return key in value;
}

export type PartialBy<T, K = keyof T> =
  Omit<T, K & keyof T> & Partial<Pick<T, K & keyof T>> extends infer U
    ? { [K in keyof U]: U[K] }
    : never;

export type RequiredBy<T, K = keyof T> =
  T & Required<Pick<T, K & keyof T>> extends infer U ? { [K in keyof U]: U[K] }
    : never;

export function isRequestError(
  executionResult: ExecutionResult,
): executionResult is RequiredBy<Omit<ExecutionResult, "data">, "errors"> {
  return !("data" in executionResult);
}

export function safeSync<R, E>(
  fn: () => R,
): [data: R] | [data: undefined, error: E] {
  try {
    return [fn()];
  } catch (er) {
    return [, er];
  }
}

export type GraphQLRequestParameters = PartialBy<
  GraphQLParameters,
  "variableValues" | "operationName" | "extensions"
>;
