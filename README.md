# graphql-transport-ws

The WebSocket
[graphql-transport-ws](https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md)
sub-protocol implementation.

## Usage

core

- `createGraphQLTransportWs` - Create API that handles sending and receiving
  messages for the `graphql-transport-ws` sub-protocol.
- `createClient` - Create client-side `graphql-transport-ws` sub-protocol
  compliant API.
- `createServer` - Create server-side `graphql-transport-ws` sub-protocol
  compliant API.

utils

- `parseMessage` - Parse the value as `graphql-transport-ws` message data.
- `createWebSocket` - Create `WebSocket` instance with `graphql-transport-ws`
  sub-protocol.
- `PROTOCOL` - Sub-protocol
- `MessageType` - Definition of `graphql-transport-ws` message type.
- `Status` - Definition of `graphql-transport-ws` WebSocket private status code.
- `STATUS_TEXT` - A record of all the private status codes text.

### Ping and Pong

```ts
import { createGraphQLTransportWs } from "https://deno.land/x/graphql_transport_ws@$VERSION/mod.ts";
const graphqlTransportWs = createGraphQLTransportWs("<ENDPOINT>");

graphqlTransportWs.addEventListener("pong", (ev) => {
  console.log(ev.data);
});
graphqlTransportWs.ping();

graphqlTransportWs.addEventListener("ping", () => {
  graphqlTransportWs.pong();
});
```

### Subscribe subscription

```ts
import { createGraphQLTransportWs } from "https://deno.land/x/graphql_transport_ws@$VERSION/mod.ts";
const graphqlTransportWs = createGraphQLTransportWs("<ENDPOINT>");

graphqlTransportWs.addEventListener("connectionack", (ev) => {
  console.log(ev.data);
});
graphqlTransportWs.addEventListener("next", (ev) => {
  console.log(ev.data.id, ev.data.payload);
});

graphqlTransportWs.connectionInit();
graphqlTransportWs.subscribe({
  query: `subscription { hello }`,
});
```

### Parse message

```ts
import {
  MessageType,
  parseMessage,
} from "https://deno.land/x/graphql_transport_ws@$VERSION/mod.ts";
import { assertEquals } from "https://deno.land/std@$VERSION/testing/asserts.ts";
const ev = new MessageEvent("message", {
  data: JSON.stringify({
    type: "pong",
  }),
});
const result = parseMessage(ev.data);
assertEquals(result[0], { "type": MessageType.Pong });
assertEquals(result[1], undefined);
```

## License

Copyright © 2022-present [TomokiMiyauci](https://github.com/TomokiMiyauci).

Released under the [MIT](./LICENSE) license

`graphql-transport-ws`: [enisdenjo](https://github.com/enisdenjo)
