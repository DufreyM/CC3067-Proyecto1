# mcp-network-bridge

Generic bridge that wraps **any** existing stdio MCP server - unmodified - and re-exposes it over HTTP on a TCP
port, so a chatbot on another machine on the same local network can connect to it exactly the way it connects to a
server it spawns locally. It does not know or care what language/SDK the wrapped server uses; it only relays
JSON-RPC messages.

Built for CC3067 Proyecto 1's revised functionality 6: *"interconectar su chatbot con el MCP de algún compañero...
tal y como utiliza el servidor local... la prueba se hará a través de una red local."* None of the three classmate
servers this project uses (`hotel-mcp-server`, `mcp-server-rrhh-construccion`, `brewops-mcp`) expose a network
transport on their own - all three are stdio-only - so this tool stands in front of any of them.

## How it works

1. Spawns the wrapped server as a child process, exactly like any MCP host would (stdio, JSON-RPC).
2. Listens on an HTTP port and, for every request, relays `initialize`, `tools/list` and `tools/call` to that child
   process, returning its response as plain `application/json` (the non-streaming variant the MCP Streamable HTTP
   spec explicitly allows - this project's demo only needs simple request/response, not resumable SSE streams).

## Usage

```bash
npm run bridge -- --port 4100 --cwd "<path-to-server-repo>" -- <command> [args...]
```

Examples for the three classmate servers used in this project (run from the repo root):

```bash
# hotel-mcp-server
npm run bridge -- --port 4100 --cwd ../external-mcp-servers/hotel-mcp-server -- ../external-mcp-servers/hotel-mcp-server/.venv/Scripts/python.exe -m hotel_mcp

# mcp-server-rrhh-construccion
npm run bridge -- --port 4101 --cwd ../external-mcp-servers/mcp-server-rrhh-construccion -- ../external-mcp-servers/mcp-server-rrhh-construccion/.venv/Scripts/python.exe server.py

# brewops-mcp
npm run bridge -- --port 4102 -- ../external-mcp-servers/brewops-mcp/brewops.exe
```

On startup it prints every URL it is reachable at, including its LAN IP(s):

```
Escuchando en el puerto 4100. URLs disponibles:
  http://localhost:4100/mcp   (misma maquina)
  http://192.168.1.106:4100/mcp   (red local, usa esta desde otra maquina)
```

## Running the real local-network demo

1. On the machine that has the classmate's server set up, run the bridge as shown above and note the LAN IP it
   prints.
2. On the chatbot machine (can be the same one, or a different one on the same Wi-Fi/LAN), set
   `MCP_REMOTE_URL=http://<that-ip>:4100/mcp` in `chatbot/.env` before running `npm run chatbot`.
3. The chatbot's `hotel-remote` server entry ([serversConfig.ts](../../chatbot/src/mcp/serversConfig.ts)) connects
   to it with the official `StreamableHTTPClientTransport` - the same tool names, schemas and call semantics as the
   `hotel` entry that spawns the same server locally over stdio, only the transport differs.

## Why not the SDK's own StreamableHTTPServerTransport?

An earlier version of this tool used `@modelcontextprotocol/sdk`'s `Server` + `StreamableHTTPServerTransport`
directly. It returned a bare `500` with no body even in a minimal, otherwise-correct reproduction on the SDK
version this project pins - a small hand-rolled relay for the non-streaming subset of the protocol turned out to
be both more reliable and simpler to reason about for this project's actual need (a plain LAN request/response
relay, no resumable streams or server push). The client side of the connection still uses the official,
unmodified `StreamableHTTPClientTransport`.

## License

MIT
