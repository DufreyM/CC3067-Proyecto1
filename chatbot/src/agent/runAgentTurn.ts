import type { Tool, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { sendMessage } from "../llm/anthropicClient.js";
import type { ConversationManager } from "../session/conversationManager.js";
import type { McpClientManager } from "../mcp/mcpClientManager.js";
import { ConfirmationGate, readBooleanField } from "../mcp/confirmationGate.js";

/**
 * hotel__crear_reservacion writes only when called with `confirmado: true`.
 * Its README warns a host must not let the model chain the preview and the
 * confirmed call in the same reply - see confirmationGate.ts.
 */
const GUARDED_WRITE_TOOL = "hotel__crear_reservacion";

export interface AgentTurnHooks {
  onAssistantText: (text: string) => void;
  onToolCall: (name: string, input: Record<string, unknown>) => void;
  onToolBlocked: (name: string, reason: string) => void;
  onToolError: (name: string, message: string) => void;
}

/**
 * Runs one user turn to completion: keeps calling the LLM and executing any
 * requested MCP tools until the model responds with plain text instead of a
 * tool_use request. Shared by both hosts this project ships (the console
 * chatbot and the web UI's server) so the actual agent/tool-calling logic -
 * including the write-confirmation gate - exists in exactly one place.
 */
export async function runAgentTurn(
  conversation: ConversationManager,
  tools: Tool[],
  mcp: McpClientManager,
  confirmationGate: ConfirmationGate,
  hooks: AgentTurnHooks,
): Promise<void> {
  while (true) {
    const response = await sendMessage({ history: conversation.getHistory(), tools });
    conversation.addAssistantMessage(response.content);

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    if (text) hooks.onAssistantText(text);

    if (response.stop_reason !== "tool_use") break;

    const toolResults: ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const input = block.input as Record<string, unknown>;

      if (block.name === GUARDED_WRITE_TOOL && input.confirmado === true && !confirmationGate.isConfirmedByUser()) {
        const reason = "falta confirmacion del usuario en un mensaje nuevo";
        hooks.onToolBlocked(block.name, reason);
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

      hooks.onToolCall(block.name, input);
      try {
        const result = await mcp.callTool(block.name, input);
        if (block.name === GUARDED_WRITE_TOOL) {
          if (input.confirmado === true) confirmationGate.clearPending();
          else if (readBooleanField(result, "requiere_confirmacion")) confirmationGate.markPending();
        }
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        hooks.onToolError(block.name, message);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Error: ${message}`, is_error: true });
      }
    }
    conversation.addUserMessage(toolResults);
  }
}
