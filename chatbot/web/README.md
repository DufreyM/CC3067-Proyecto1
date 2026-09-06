# Chatbot Web UI

React + [Ant Design](https://ant.design) + [`@ant-design/x`](https://x.ant.design) frontend for the CC3067
Proyecto 1 chatbot (extra credit, section 4.1: "implemente una UI... mediante un chatbot Web"). It talks to the
same agent/tool-calling core the console chatbot uses ([`chatbot/src/agent/runAgentTurn.ts`](../src/agent/runAgentTurn.ts)),
over a WebSocket backend ([`chatbot/src/server.ts`](../src/server.ts)) - no logic is duplicated between the two UIs.

The backend always connects the "own" servers (filesystem, git, DocFinder) at startup. Classmates' servers
(functionality 6) start off - most of the grading and all of the day-to-day work is about the own side - and can
be turned on or off at runtime from the **"Servidores de compañeros"** switch in the header, with no restart: it
sends `{type: "toggle_classmates", enabled}` over the same WebSocket, the backend connects/disconnects just that
group of MCP servers, and every connected browser tab gets a fresh `server_status`/`tools_summary` broadcast.

## Running

Two processes, from the repository root:

```bash
# Terminal 1: backend (connects all MCP servers once, exposes them over WebSocket)
npm run web-server

# Terminal 2: frontend
npm run web-client
```

Then open the URL Vite prints (default `http://localhost:5173`). The backend listens on
`ws://localhost:8787/ws` by default; override either with `WEB_SERVER_PORT` (backend, in `chatbot/.env`) or
`VITE_WS_URL` (frontend, in a `chatbot/web/.env` file) if you need different ports.

## What it shows

- **Header**: connection badge, total MCP tool count, and a colored tag per MCP server (green = connected, red =
  failed to connect) - the same information the console UI prints at startup, kept visible at all times here.
- **Conversation**: `Bubble.List` from `@ant-design/x`, with a distinct role per message type: the user's own
  messages, the assistant's replies (rendered as Markdown), and MCP tool activity - shown as its own bubble type
  (normal call, blocked by the write-confirmation gate, or errored) so the tool-calling loop required by
  functionality 3 (logging every MCP interaction) is visible in the conversation itself, not just the backend
  terminal.
- **Input**: `Sender` from `@ant-design/x`, disabled while disconnected and while waiting for a reply.

## Why Ant Design / `@ant-design/x`

`@ant-design/x` ships components purpose-built for LLM chat UIs (`Bubble.List`, `Sender`) instead of generic
layout primitives, which kept this within scope: a small, purpose-built component library led to something that
looks complete quickly, rather than hand-building a message list and input box from scratch.
