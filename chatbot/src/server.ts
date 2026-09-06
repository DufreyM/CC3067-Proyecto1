import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import { ConversationManager } from "./session/conversationManager.js";
import { McpClientManager, type ServerConnectionResult } from "./mcp/mcpClientManager.js";
import { McpLogger } from "./logging/mcpLogger.js";
import { ensureWorkspaceRepo } from "./mcp/workspaceBootstrap.js";
import { ConfirmationGate } from "./mcp/confirmationGate.js";
import { runAgentTurn } from "./agent/runAgentTurn.js";
import { classmateServers, ownServers } from "./mcp/serversConfig.js";

const PORT = Number(process.env.WEB_SERVER_PORT ?? 8787);
// Loopback-only by default: this backend spends real Anthropic API credits
// per message, so it must not be reachable from the LAN unless you
// explicitly ask for that (e.g. WEB_SERVER_HOST=0.0.0.0 for a real demo on
// another machine, alongside WEB_UI_ACCESS_CODE below).
const HOST = process.env.WEB_SERVER_HOST ?? "127.0.0.1";
// Optional shared password gating the chat itself. Unset (the default)
// means no gate - fine for a purely local, single-user run.
const ACCESS_CODE = process.env.WEB_UI_ACCESS_CODE;
const CLASSMATE_NAMES = classmateServers.map((s) => s.name);

/**
 * Backend for the web UI (extra credit): a thin WebSocket layer over the
 * exact same agent/tool-calling core the console chatbot uses
 * (runAgentTurn, McpClientManager, ConfirmationGate). Own servers connect
 * once at startup; classmates' servers (functionality 6) can be turned on
 * or off at runtime from the frontend, since most of the grading is about
 * the "own" side and spinning up four extra runtimes isn't always wanted.
 * Every browser tab shares the same MCP connections but gets its own
 * conversation history and confirmation-gate state.
 */
type ClientToServerMessage =
  | { type: "user_message"; text: string }
  | { type: "toggle_classmates"; enabled: boolean }
  | { type: "auth"; code: string };

type ServerToClientMessage =
  | { type: "server_status"; servers: ServerConnectionResult[] }
  | { type: "tools_summary"; total: number; byServer: { server: string; count: number }[] }
  | { type: "classmates_status"; enabled: boolean; toggling: boolean }
  | { type: "auth_status"; required: boolean; authenticated: boolean }
  | { type: "assistant_message"; text: string }
  | { type: "tool_call"; name: string; input: unknown }
  | { type: "tool_blocked"; name: string; reason: string }
  | { type: "tool_error"; name: string; message: string }
  | { type: "turn_complete" }
  | { type: "fatal_error"; message: string };

function send(ws: WebSocket, message: ServerToClientMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function toolsSummary(tools: Tool[]): { total: number; byServer: { server: string; count: number }[] } {
  const counts = new Map<string, number>();
  for (const tool of tools) {
    const server = tool.name.split("__")[0];
    counts.set(server, (counts.get(server) ?? 0) + 1);
  }
  return { total: tools.length, byServer: Array.from(counts, ([server, count]) => ({ server, count })) };
}

async function main() {
  const logger = new McpLogger();
  const mcp = new McpClientManager(logger);
  const clients = new Set<WebSocket>();

  function broadcast(message: ServerToClientMessage): void {
    for (const ws of clients) send(ws, message);
  }

  await ensureWorkspaceRepo();
  let connections = await mcp.connectAll(ownServers);
  let classmatesOn = process.env.ENABLE_CLASSMATE_SERVERS === "true";
  if (classmatesOn) connections = [...connections, ...(await mcp.connectAll(classmateServers))];
  let togglingClassmates = false;

  for (const { name, ok, detail } of connections) {
    console.log(`[MCP] ${name}: ${ok ? "ok" : "fallo"} (${detail})`);
  }
  let tools = await mcp.listAnthropicTools();

  async function setClassmatesEnabled(enabled: boolean): Promise<void> {
    if (togglingClassmates || enabled === classmatesOn) return;
    togglingClassmates = true;
    broadcast({ type: "classmates_status", enabled: classmatesOn, toggling: true });

    if (enabled) {
      const results = await mcp.connectAll(classmateServers);
      connections = [...connections.filter((c) => !CLASSMATE_NAMES.includes(c.name)), ...results];
    } else {
      await mcp.disconnectByNames(CLASSMATE_NAMES);
      connections = connections.filter((c) => !CLASSMATE_NAMES.includes(c.name));
    }
    tools = await mcp.listAnthropicTools();
    classmatesOn = enabled;
    togglingClassmates = false;

    broadcast({ type: "server_status", servers: connections });
    broadcast({ type: "tools_summary", ...toolsSummary(tools) });
    broadcast({ type: "classmates_status", enabled: classmatesOn, toggling: false });
  }

  const httpServer = createServer();
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));

    let authenticated = !ACCESS_CODE;
    const conversation = new ConversationManager();
    const confirmationGate = new ConfirmationGate();

    send(ws, { type: "server_status", servers: connections });
    send(ws, { type: "tools_summary", ...toolsSummary(tools) });
    send(ws, { type: "classmates_status", enabled: classmatesOn, toggling: togglingClassmates });
    send(ws, { type: "auth_status", required: !!ACCESS_CODE, authenticated });

    ws.on("message", async (raw) => {
      let message: ClientToServerMessage;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        send(ws, { type: "fatal_error", message: "Mensaje invalido" });
        return;
      }

      if (message.type === "auth") {
        authenticated = message.code === ACCESS_CODE;
        send(ws, { type: "auth_status", required: !!ACCESS_CODE, authenticated });
        return;
      }
      if (!authenticated) {
        send(ws, { type: "fatal_error", message: "Codigo de acceso requerido o incorrecto." });
        return;
      }

      if (message.type === "toggle_classmates") {
        await setClassmatesEnabled(message.enabled);
        return;
      }
      if (message.type !== "user_message" || !message.text?.trim()) return;

      confirmationGate.startNewTurn();
      conversation.addUserMessage(message.text.trim());

      try {
        await runAgentTurn(conversation, tools, mcp, confirmationGate, {
          onAssistantText: (text) => send(ws, { type: "assistant_message", text }),
          onToolCall: (name, input) => send(ws, { type: "tool_call", name, input }),
          onToolBlocked: (name, reason) => send(ws, { type: "tool_blocked", name, reason }),
          onToolError: (name, msg) => send(ws, { type: "tool_error", name, message: msg }),
          onUsage: (usage) =>
            console.log(
              `[tokens] in:${usage.inputTokens} out:${usage.outputTokens} cache_read:${usage.cacheReadTokens} cache_write:${usage.cacheCreationTokens}`,
            ),
        });
        send(ws, { type: "turn_complete" });
      } catch (error) {
        send(ws, { type: "fatal_error", message: error instanceof Error ? error.message : String(error) });
      }
    });
  });

  httpServer.listen(PORT, HOST, () => {
    console.log(`Web UI backend escuchando en ws://${HOST}:${PORT}/ws`);
    if (HOST !== "127.0.0.1" && !ACCESS_CODE) {
      console.warn(
        "[seguridad] WEB_SERVER_HOST no es localhost y WEB_UI_ACCESS_CODE no esta configurado: " +
          "cualquiera en la red puede usar tu chatbot (y tus creditos de API). Configura WEB_UI_ACCESS_CODE.",
      );
    }
  });

  const shutdown = async () => {
    wss.close();
    httpServer.close();
    await mcp.closeAll();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Error fatal iniciando el servidor web:", error);
  process.exit(1);
});
