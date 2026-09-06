import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import { ConversationManager } from "./session/conversationManager.js";
import { McpClientManager } from "./mcp/mcpClientManager.js";
import { McpLogger } from "./logging/mcpLogger.js";
import { ensureWorkspaceRepo } from "./mcp/workspaceBootstrap.js";
import { ConfirmationGate } from "./mcp/confirmationGate.js";
import { runAgentTurn } from "./agent/runAgentTurn.js";

const PORT = Number(process.env.WEB_SERVER_PORT ?? 8787);

/**
 * Backend for the web UI (extra credit): a thin WebSocket layer over the
 * exact same agent/tool-calling core the console chatbot uses
 * (runAgentTurn, McpClientManager, ConfirmationGate). MCP servers are
 * connected once for the whole process and shared by every browser tab;
 * each WebSocket connection gets its own conversation history and
 * confirmation-gate state, like a separate chat session.
 */
type ClientToServerMessage = { type: "user_message"; text: string };

type ServerToClientMessage =
  | { type: "server_status"; servers: { name: string; ok: boolean; detail: string }[] }
  | { type: "tools_summary"; total: number; byServer: { server: string; count: number }[] }
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

  await ensureWorkspaceRepo();
  const connections = await mcp.connectAll();
  for (const { name, ok, detail } of connections) {
    console.log(`[MCP] ${name}: ${ok ? "ok" : "fallo"} (${detail})`);
  }
  const tools = await mcp.listAnthropicTools();

  const httpServer = createServer();
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws) => {
    const conversation = new ConversationManager();
    const confirmationGate = new ConfirmationGate();

    send(ws, { type: "server_status", servers: connections });
    send(ws, { type: "tools_summary", ...toolsSummary(tools) });

    ws.on("message", async (raw) => {
      let message: ClientToServerMessage;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        send(ws, { type: "fatal_error", message: "Mensaje invalido" });
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
        });
        send(ws, { type: "turn_complete" });
      } catch (error) {
        send(ws, { type: "fatal_error", message: error instanceof Error ? error.message : String(error) });
      }
    });
  });

  httpServer.listen(PORT, () => console.log(`Web UI backend escuchando en ws://localhost:${PORT}/ws`));

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
