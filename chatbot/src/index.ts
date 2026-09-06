import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { Tool, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { sendMessage } from "./llm/anthropicClient.js";
import { ConversationManager } from "./session/conversationManager.js";
import { McpClientManager } from "./mcp/mcpClientManager.js";
import { McpLogger } from "./logging/mcpLogger.js";
import { ensureWorkspaceRepo } from "./mcp/workspaceBootstrap.js";
import { ConfirmationGate, readBooleanField } from "./mcp/confirmationGate.js";
import {
  printAssistant,
  printBanner,
  printExampleHints,
  printFatalError,
  printGoodbye,
  printToolBlocked,
  printToolCall,
  printToolError,
  printToolsSummary,
  userPromptLabel,
} from "./ui/console.js";

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

  printBanner();
  await ensureWorkspaceRepo();
  await mcp.connectAll();
  const tools = await mcp.listAnthropicTools();
  printToolsSummary(tools);
  printExampleHints();

  const rl = createInterface({ input: stdin, output: stdout });

  while (true) {
    let rawInput: string;
    try {
      rawInput = await rl.question(userPromptLabel());
    } catch {
      break; // stdin closed (EOF from piped input, Ctrl+D, etc.) - exit cleanly
    }
    const userInput = rawInput.trim();
    if (EXIT_COMMANDS.has(userInput.toLowerCase())) break;
    if (!userInput) continue;

    confirmationGate.startNewTurn();
    conversation.addUserMessage(userInput);
    await runAgentTurn(conversation, tools, mcp, confirmationGate);
  }

  rl.close();
  await mcp.closeAll();
  printGoodbye();
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
      printAssistant(text);
    }

    if (response.stop_reason !== "tool_use") break;

    const toolResults: ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const input = block.input as Record<string, unknown>;

      if (block.name === GUARDED_WRITE_TOOL && input.confirmado === true && !confirmationGate.isConfirmedByUser()) {
        printToolBlocked(block.name, "falta confirmacion del usuario en un mensaje nuevo");
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

      printToolCall(block.name, input);
      try {
        const result = await mcp.callTool(block.name, input);
        if (block.name === GUARDED_WRITE_TOOL) {
          if (input.confirmado === true) confirmationGate.clearPending();
          else if (readBooleanField(result, "requiere_confirmacion")) confirmationGate.markPending();
        }
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        printToolError(message);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Error: ${message}`, is_error: true });
      }
    }
    conversation.addUserMessage(toolResults);
  }
}

main().catch((error) => {
  printFatalError(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
