# CC3067 - Proyecto 1: MCP Console Chatbot

Console chatbot (host) that talks to the Anthropic API and uses the **Model
Context Protocol (MCP)** to extend the LLM with external tools: a local
filesystem server, a git server, a custom local server (**DocFinder**, an
internal documentation search assistant), servers built by classmates, and a
remote MCP server.

> Project for CC3067 - Redes, Universidad del Valle de Guatemala.

## Status

This project is being built incrementally. Current state:

- [x] Connect to the Anthropic API and answer general questions
- [x] Maintain conversation context across turns
- [x] Log every MCP request/response
- [x] Filesystem MCP server + Git MCP server (official)
- [x] Custom local MCP server: DocFinder
- [x] Classmates' MCP servers (hotel, HR/construction, coffee shop - 3, two required)
- [ ] Remote MCP server (Cloudflare Workers)
- [ ] Wireshark capture and protocol analysis
- [ ] Final report

## Repository layout

```
CC3067-Proyecto1/
├── chatbot/          # Console host: Anthropic API client, MCP clients, logging
├── servers/
│   └── remote/       # Remote MCP server (deployed to Cloudflare Workers)
└── docs/             # Report, Wireshark captures, MCP server specs
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
npm run chatbot
```

Type your message and press enter. Type `salir` (or `exit`/`quit`) to end the
session.

## License

MIT
