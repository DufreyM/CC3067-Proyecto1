import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages";
import { config } from "../config.js";

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

export interface SendMessageOptions {
  history: MessageParam[];
  tools?: Tool[];
}

/**
 * Thin wrapper around the Messages API. Tool definitions are optional so this
 * same function keeps working once MCP tools are wired into `tools`.
 */
export async function sendMessage({ history, tools }: SendMessageOptions) {
  return anthropic.messages.create({
    model: config.model,
    max_tokens: config.maxTokens,
    messages: history,
    tools,
  });
}

export type { Tool };
