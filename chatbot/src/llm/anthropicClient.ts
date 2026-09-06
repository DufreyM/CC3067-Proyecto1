import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlockParam, MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages";
import { config } from "../config.js";

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

export interface SendMessageOptions {
  history: MessageParam[];
  tools?: Tool[];
}

/**
 * Marks a cache breakpoint on the last tool definition, so the ~60+ MCP tool
 * schemas (large and identical on every call in a session) are cached by
 * Anthropic instead of being billed as fresh input tokens on every message.
 */
function withToolsCache(tools: Tool[] | undefined): Tool[] | undefined {
  if (!tools || tools.length === 0) return tools;
  const lastIndex = tools.length - 1;
  return tools.map((tool, index) =>
    index === lastIndex ? { ...tool, cache_control: { type: "ephemeral" as const } } : tool,
  );
}

/**
 * Marks a cache breakpoint on the last content block of the last message, so
 * the growing conversation history is cached incrementally: each call only
 * pays full price for what was added since the previous call, not the whole
 * history again. This is the pattern Anthropic recommends for multi-turn
 * chat (see prompt caching docs) - the marker moves forward every turn since
 * `history` always grows by appending.
 */
function withHistoryCache(history: MessageParam[]): MessageParam[] {
  if (history.length === 0) return history;
  const lastIndex = history.length - 1;
  const lastMessage = history[lastIndex];

  const blocks: ContentBlockParam[] =
    typeof lastMessage.content === "string" ? [{ type: "text", text: lastMessage.content }] : lastMessage.content;
  if (blocks.length === 0) return history;

  const lastBlockIndex = blocks.length - 1;
  const cachedBlocks = blocks.map((block, index) =>
    index === lastBlockIndex ? { ...block, cache_control: { type: "ephemeral" as const } } : block,
  );

  return [...history.slice(0, lastIndex), { ...lastMessage, content: cachedBlocks }];
}

/**
 * Thin wrapper around the Messages API. Tool definitions are optional so this
 * same function keeps working once MCP tools are wired into `tools`.
 */
export async function sendMessage({ history, tools }: SendMessageOptions) {
  return anthropic.messages.create({
    model: config.model,
    max_tokens: config.maxTokens,
    messages: withHistoryCache(history),
    tools: withToolsCache(tools),
  });
}

export type { Tool };
