# CC3067 - Proyecto 1: MCP Console Chatbot

Console chatbot (host) that talks to the Anthropic API and uses the **Model
Context Protocol (MCP)** to extend the LLM with external tools: a local
filesystem server, a git server, a custom local server (**DocFinder**, an
internal documentation search assistant), and three servers built by
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
- [x] Classmates' MCP servers, local via stdio (hotel, HR/construction, coffee shop - 3, two required)
- [x] One classmate's server reached "as remote", over the local network (generic stdio-to-HTTP bridge)
- [ ] Final report

## Repository layout

```
CC3067-Proyecto1/
├── chatbot/                  # Console host: Anthropic API client, MCP clients, logging
└── tools/
    └── mcp-network-bridge/   # Generic stdio-to-HTTP bridge for the local-network demo
```

The custom local MCP server **DocFinder** lives in its own public repository
(required by the assignment):
[DufreyM/CC3067-Proyecto1-docfinder](https://github.com/DufreyM/CC3067-Proyecto1-docfinder). Clone it as a sibling
folder of this repository (default expected path) or point `DOCFINDER_SERVER_PATH` in `.env` at wherever you
cloned it.

For functionality 6, this chatbot connects to three classmates' local MCP servers (two are the assignment's
minimum), each cloned as a sibling of this repo under `external-mcp-servers/`:

| Server | Repo | Language | Command this project runs |
| --- | --- | --- | --- |
| `hotel` | [JosFer720/hotel-mcp-server](https://github.com/JosFer720/hotel-mcp-server) | Python | `.venv/Scripts/python.exe -m hotel_mcp` |
| `rrhh` | [NESHGP04/mcp-server-rrhh-construccion](https://github.com/NESHGP04/mcp-server-rrhh-construccion) | Python | `.venv/Scripts/python.exe server.py` |
| `brewops` | [Jonialen/brewops-mcp](https://github.com/Jonialen/brewops-mcp) | Go | compiled `brewops.exe` binary |

Every path can be overridden with an env var (see `.env.example`) if you cloned them somewhere else.

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
cd brewops-mcp && go build -o brewops.exe . && cd ../..
```

Any of these three servers that fails to start (wrong path, missing runtime) is skipped with a warning - the
chatbot still runs with whichever servers did connect.

### Design note: confirming writes across turns

`hotel-mcp-server`'s `crear_reservacion` tool only writes when called a second time with `confirmado: true`; its
README explicitly warns that a host must not let the model call the preview and the confirmed write back to back
in the same reply, since only the host can see that a real user message arrived in between. This chatbot enforces
that in [`chatbot/src/mcp/confirmationGate.ts`](chatbot/src/mcp/confirmationGate.ts): a `confirmado: true` call is
rejected unless the preview happened in an earlier user turn.

## Usage

```bash
# Optional: serve the hotel server over the network too (see tools/mcp-network-bridge/README.md)
npm run bridge -- --port 4100 --cwd external-mcp-servers/hotel-mcp-server -- external-mcp-servers/hotel-mcp-server/.venv/Scripts/python.exe -m hotel_mcp

npm run chatbot
```

Type your message and press enter. Type `salir` (or `exit`/`quit`) to end the
session.

## License

MIT
