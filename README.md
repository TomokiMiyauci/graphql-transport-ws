# graphql-transport-ws

The WebSocket
[graphql-transport-ws](https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md)
sub-protocol implementation.

## Usage

- `createGraphQLTransportWs` - Create API that handles sending and receiving
  messages for the `graphql-transport-ws` sub-protocol.
- `createClient` - Create client-side `graphql-transport-ws` sub-protocol
  compliant API.
- `createServer` - Create server-side `graphql-transport-ws` sub-protocol
  compliant API.

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

## License

Copyright © 2022-present [TomokiMiyauci](https://github.com/TomokiMiyauci).

Released under the [MIT](./LICENSE) license

`graphql-transport-ws`: [enisdenjo](https://github.com/enisdenjo)
