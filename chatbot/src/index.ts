import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { Tool, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { sendMessage } from "./llm/anthropicClient.js";
import { ConversationManager } from "./session/conversationManager.js";
import { McpClientManager } from "./mcp/mcpClientManager.js";
import { McpLogger } from "./logging/mcpLogger.js";
import { ensureWorkspaceRepo } from "./mcp/workspaceBootstrap.js";
import { ConfirmationGate, readBooleanField } from "./mcp/confirmationGate.js";

const EXIT_COMMANDS = new Set(["salir", "exit", "quit"]);

/**
 * hotel__crear_reservacion writes only when called with `confirmado: true`.
 * Its README warns a host must not let the model chain the preview and the
 * confirmed call in the same reply - see confirmationGate.ts.
 */
const GUARDED_WRITE_TOOL = "hotel__crear_reservacion";

async function main() {
  const conversation = new ConversationManager();
  const logger = new McpLogger();
  const mcp = new McpClientManager(logger);
  const confirmationGate = new ConfirmationGate();

  await ensureWorkspaceRepo();
  await mcp.connectAll();
  const tools = await mcp.listAnthropicTools();
  console.log(`[MCP] ${tools.length} herramientas disponibles: ${tools.map((t) => t.name).join(", ") || "(ninguna)"}\n`);

  const rl = createInterface({ input: stdin, output: stdout });
  console.log("Chatbot MCP - CC3067 Proyecto 1");
  console.log('Escribe tu mensaje (o "salir" para terminar).\n');

  while (true) {
    const userInput = (await rl.question("Tu > ")).trim();
    if (EXIT_COMMANDS.has(userInput.toLowerCase())) break;
    if (!userInput) continue;

    confirmationGate.startNewTurn();
    conversation.addUserMessage(userInput);
    await runAgentTurn(conversation, tools, mcp, confirmationGate);
  }

  rl.close();
  await mcp.closeAll();
  console.log("Hasta luego.");
}

/**
 * Runs one user turn to completion: keeps calling the LLM and executing any
 * requested MCP tools until the model responds with plain text instead of a
 * tool_use request.
 */
async function runAgentTurn(
  conversation: ConversationManager,
  tools: Tool[],
  mcp: McpClientManager,
  confirmationGate: ConfirmationGate,
): Promise<void> {
  while (true) {
    const response = await sendMessage({ history: conversation.getHistory(), tools });
    conversation.addAssistantMessage(response.content);

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    if (text) {
      console.log(`Bot > ${text}\n`);
    }

    if (response.stop_reason !== "tool_use") break;

    const toolResults: ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const input = block.input as Record<string, unknown>;

      if (block.name === GUARDED_WRITE_TOOL && input.confirmado === true && !confirmationGate.isConfirmedByUser()) {
        console.log(`  [bloqueado] ${block.name}: falta confirmacion del usuario en un mensaje nuevo`);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content:
            "No se puede confirmar todavia. Primero muestra la reserva propuesta al usuario en tu respuesta " +
            "y espera a que confirme explicitamente en un mensaje nuevo antes de volver a llamar esta " +
            "herramienta con confirmado=true.",
          is_error: true,
        });
        continue;
      }

      console.log(`  [herramienta] ${block.name}(${JSON.stringify(input)})`);
      try {
        const result = await mcp.callTool(block.name, input);
        if (block.name === GUARDED_WRITE_TOOL) {
          if (input.confirmado === true) confirmationGate.clearPending();
          else if (readBooleanField(result, "requiere_confirmacion")) confirmationGate.markPending();
        }
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
      } catch (error) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Error: ${error instanceof Error ? error.message : String(error)}`,
          is_error: true,
        });
      }
    }
    conversation.addUserMessage(toolResults);
  }
}

main().catch((error) => {
  console.error("Error fatal en el chatbot:", error);
  process.exit(1);
});
