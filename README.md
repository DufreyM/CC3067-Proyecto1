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
- [ ] Two classmates' MCP servers
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

## Requirements

- Node.js >= 20
- Python >= 3.10 with `pip install mcp-server-git` (official Git MCP server)
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
```

## Usage

```bash
npm run chatbot
```

Type your message and press enter. Type `salir` (or `exit`/`quit`) to end the
session.

## License

MIT
