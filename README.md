# CC3067 - Proyecto 1: MCP Console Chatbot

Console chatbot (host) that talks to the Anthropic API and uses the **Model
Context Protocol (MCP)** to extend the LLM with external tools: a local
filesystem server, a git server, a custom local server (**DocFinder**, an
internal documentation search assistant), and four servers built by
classmates - one of which is also reached over the local network instead of
spawned locally, through a small generic bridge built for this project.

> Project for CC3067 - Redes, Universidad del Valle de Guatemala.
>
> Scope note: per an in-class clarification, functionality 6 was revised to
> require reaching a classmate's server over a local network connection
> (instead of building an own cloud-hosted remote server), and the Wireshark
> capture/analysis requirement was dropped entirely. This README reflects
> that revised scope, not the original written assignment PDF.

## Status

This project is being built incrementally. Current state:

- [x] Connect to the Anthropic API and answer general questions
- [x] Maintain conversation context across turns
- [x] Log every MCP request/response
- [x] Filesystem MCP server + Git MCP server (official)
- [x] Custom local MCP server: DocFinder
- [x] Classmates' MCP servers, local via stdio (hotel, HR/construction, coffee shop, library - 4, two required)
- [x] One classmate's server reached "as remote", over the local network (generic stdio-to-HTTP bridge)
- [x] Extra: terminal UI with HCI-driven color/layout choices
- [x] Extra: web chatbot UI (React + Ant Design / `@ant-design/x`)
- [ ] Final report

## Repository layout

```
CC3067-Proyecto1/
├── chatbot/
│   ├── src/
│   │   ├── agent/             # Shared agent/tool-calling loop (used by both UIs)
│   │   ├── index.ts           # Console host entrypoint
│   │   └── server.ts          # WebSocket backend for the web UI
│   └── web/                   # React + Ant Design frontend (extra credit)
└── tools/
    └── mcp-network-bridge/   # Generic stdio-to-HTTP bridge for the local-network demo
```

The custom local MCP server **DocFinder** lives in its own public repository
(required by the assignment):
[DufreyM/CC3067-Proyecto1-docfinder](https://github.com/DufreyM/CC3067-Proyecto1-docfinder). Clone it as a sibling
folder of this repository (default expected path) or point `DOCFINDER_SERVER_PATH` in `.env` at wherever you
cloned it.

For functionality 6, this chatbot connects to four classmates' local MCP servers (two are the assignment's
minimum), each cloned as a sibling of this repo under `external-mcp-servers/`:

| Server | Repo | Language | Command this project runs |
| --- | --- | --- | --- |
| `hotel` | [JosFer720/hotel-mcp-server](https://github.com/JosFer720/hotel-mcp-server) | Python | `.venv/Scripts/python.exe -m hotel_mcp` |
| `rrhh` | [NESHGP04/mcp-server-rrhh-construccion](https://github.com/NESHGP04/mcp-server-rrhh-construccion) | Python | `.venv/Scripts/python.exe server.py` |
| `brewops` | [Jonialen/brewops-mcp](https://github.com/Jonialen/brewops-mcp) | Go | compiled `brewops.exe` binary |
| `biblioteca` | [tismajo/CC3067-Proyecto1](https://github.com/tismajo/CC3067-Proyecto1) (`backend/mcp_servers/local_library`) | Python | `.venv/Scripts/python.exe -m mcp_servers.local_library.server` |

Every path can be overridden with an env var (see `.env.example`) if you cloned them somewhere else.

`biblioteca` is a full project repo rather than an independent one, has no README, and its server needs a real
MySQL database instead of a self-seeding file - see "Provisioning MySQL for `biblioteca`" below. It also returns
Spanish accented characters mojibake'd (e.g. `EducaciÃ³n`) because its DB connection doesn't set `charset=utf8mb4` -
a bug in that server, left as-is since this project only consumes it over stdio.

### Reaching a classmate's server "as remote", over the local network

None of the three servers above expose a network transport on their own (all three are stdio-only), so
[`tools/mcp-network-bridge`](tools/mcp-network-bridge) wraps any of them - unmodified - and re-exposes it over
HTTP on a LAN-reachable port. The chatbot's `hotel-remote` entry connects to it with the official
`StreamableHTTPClientTransport`, using the exact same tools as the stdio `hotel` entry - only the transport
differs. See that tool's README for how to run it (locally, or on a second machine on the same network) and how
to point `MCP_REMOTE_URL` at it.

## Requirements

- Node.js >= 20
- Python >= 3.10 with `pip install mcp-server-git` (official Git MCP server)
- Python >= 3.12 (for `hotel-mcp-server` and `mcp-server-rrhh-construccion`, see below)
- Go >= 1.25 (to build `brewops-mcp`), or Docker as an alternative
- An Anthropic API key ([console.anthropic.com](https://console.anthropic.com))

## Setup

```bash
# 1. This repo
npm install
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY

# 2. DocFinder (functionality 5), as a sibling folder
cd ..
git clone https://github.com/DufreyM/CC3067-Proyecto1-docfinder.git docfinder-mcp-server
cd docfinder-mcp-server && npm install
cd ..

# 3. Classmates' servers (functionality 6), as siblings under external-mcp-servers/
mkdir external-mcp-servers && cd external-mcp-servers

git clone https://github.com/JosFer720/hotel-mcp-server.git
cd hotel-mcp-server && python -m venv .venv && ./.venv/Scripts/python -m pip install -e . && cd ..

git clone https://github.com/NESHGP04/mcp-server-rrhh-construccion.git
cd mcp-server-rrhh-construccion && python -m venv .venv && ./.venv/Scripts/python -m pip install -r requirements.txt && cd ..

git clone https://github.com/Jonialen/brewops-mcp.git
cd brewops-mcp && go build -o brewops.exe . && cd ..

git clone https://github.com/tismajo/CC3067-Proyecto1.git tismajo-proyecto1
cd tismajo-proyecto1/backend && python -m venv .venv && ./.venv/Scripts/python -m pip install -r requirements.txt && cd ../../..
```

Any of these four servers that fails to start (wrong path, missing runtime, no database) is skipped with a
warning - the chatbot still runs with whichever servers did connect.

### Provisioning MySQL for `biblioteca`

Unlike the other three, this server expects a running MySQL instance with credentials hardcoded in its
`db_connection.py` (`libraryu` / `B1b!10` / database `librarydb` on `localhost:3306`, overridable via `DB_*` env
vars). Using Docker:

```bash
docker run --name library-mysql -e MYSQL_ROOT_PASSWORD=rootpass -e MYSQL_DATABASE=librarydb \
  -e MYSQL_USER=libraryu -e "MYSQL_PASSWORD=B1b!10" -p 3306:3306 -d mysql:8

# wait a few seconds for it to accept connections, then load schema + seed data:
docker exec -i library-mysql mysql -uroot -prootpass librarydb < external-mcp-servers/tismajo-proyecto1/backend/db/01.sql
docker exec -i library-mysql mysql -uroot -prootpass librarydb < external-mcp-servers/tismajo-proyecto1/backend/db/02.sql
```

### Design note: confirming writes across turns

`hotel-mcp-server`'s `crear_reservacion` tool only writes when called a second time with `confirmado: true`; its
README explicitly warns that a host must not let the model call the preview and the confirmed write back to back
in the same reply, since only the host can see that a real user message arrived in between. This chatbot enforces
that in [`chatbot/src/mcp/confirmationGate.ts`](chatbot/src/mcp/confirmationGate.ts): a `confirmado: true` call is
rejected unless the preview happened in an earlier user turn.

## Extra: terminal UI with HCI considerations

The console UI ([`chatbot/src/ui/console.ts`](chatbot/src/ui/console.ts)) uses a small, deliberate color system
rather than decorative colors: each color has exactly one meaning everywhere in the session, borrowing the
traffic-light convention people already know instead of an arbitrary palette to learn -

- **cyan** - the user's own words
- **green** - the assistant's reply (the successful result of a turn)
- **yellow** - a tool call happening in the background (caution/attention, not an error)
- **red** - an error or a blocked action
- **gray/dim** - system status and the raw MCP protocol log (present for functionality 3, but visually
  de-emphasized so it doesn't compete with the actual conversation)

Other usability choices: a compact per-server tool count instead of dumping all ~60 tool names in one line, a
short list of example prompts on startup so a first-time user knows what to ask, and truncated tool-call
arguments so a large payload doesn't push the conversation off-screen.

## Extra: web chatbot UI

[`chatbot/web`](chatbot/web) is a React + [Ant Design](https://ant.design) / [`@ant-design/x`](https://x.ant.design)
frontend talking to [`chatbot/src/server.ts`](chatbot/src/server.ts) (a WebSocket backend) over the exact same
agent core the console UI uses - see [`chatbot/web/README.md`](chatbot/web/README.md) for details and screenshots
of what it looks like. Both UIs are full implementations of the same chatbot; use whichever fits the moment (the
console one is always available per the assignment's base requirement of running from a terminal).

## Design note: prompt caching

With ~60 MCP tools connected, their JSON schemas alone are around 10,000 tokens - and every call the Messages API
is stateless, so that whole schema list (plus the growing conversation history) is normally resent, at full
price, on every single message. [`chatbot/src/llm/anthropicClient.ts`](chatbot/src/llm/anthropicClient.ts) marks
an [Anthropic prompt-cache](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) breakpoint on
the last tool definition and on the last block of the growing history, so:

- the ~10k tokens of tool schemas are written to cache once and then read back at roughly 10% of the normal input
  price on every later call in the same 5-minute window, instead of being billed at full price every time;
- the conversation history is cached incrementally too, so each turn is only billed in full for what was *added*
  since the previous call, not the entire transcript again.

Verified with real `usage` figures from the API: first call `cache_creation_input_tokens: 10413`, next call
`cache_read_input_tokens: 10413, cache_creation_input_tokens: 0`.

## Usage

```bash
# Optional: serve the hotel server over the network too (see tools/mcp-network-bridge/README.md)
npm run bridge -- --port 4100 --cwd external-mcp-servers/hotel-mcp-server -- external-mcp-servers/hotel-mcp-server/.venv/Scripts/python.exe -m hotel_mcp

npm run chatbot
```

Type your message and press enter. Type `salir` (or `exit`/`quit`) to end the
session.

For the web UI instead, run `npm run web-server` and `npm run web-client` in two terminals - see
[`chatbot/web/README.md`](chatbot/web/README.md).

## License

MIT
