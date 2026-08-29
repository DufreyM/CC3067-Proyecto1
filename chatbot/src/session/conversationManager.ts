import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

/**
 * Keeps the running message history for a single chat session so the LLM
 * has access to prior turns (required for follow-up questions like
 * "¿en que fecha nacio?" after "¿Quien fue Alan Turing?").
 */
export class ConversationManager {
  private readonly history: MessageParam[] = [];

  addUserMessage(content: MessageParam["content"]): void {
    this.history.push({ role: "user", content });
  }

  addAssistantMessage(content: MessageParam["content"]): void {
    this.history.push({ role: "assistant", content });
  }

  getHistory(): MessageParam[] {
    return this.history;
  }

  reset(): void {
    this.history.length = 0;
  }
}
