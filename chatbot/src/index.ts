import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { ConversationManager } from "./session/conversationManager.js";
import { McpClientManager } from "./mcp/mcpClientManager.js";
import { McpLogger } from "./logging/mcpLogger.js";
import { ensureWorkspaceRepo } from "./mcp/workspaceBootstrap.js";
import { ConfirmationGate } from "./mcp/confirmationGate.js";
import { runAgentTurn } from "./agent/runAgentTurn.js";
import {
  printAssistant,
  printBanner,
  printExampleHints,
  printFatalError,
  printGoodbye,
  printServerStatus,
  printToolBlocked,
  printToolCall,
  printToolError,
  printToolsSummary,
  printUsage,
  userPromptLabel,
} from "./ui/console.js";

const EXIT_COMMANDS = new Set(["salir", "exit", "quit"]);

async function main() {
  const conversation = new ConversationManager();
  const logger = new McpLogger();
  const mcp = new McpClientManager(logger);
  const confirmationGate = new ConfirmationGate();

  printBanner();
  await ensureWorkspaceRepo();
  const connections = await mcp.connectAll();
  for (const { name, ok, detail } of connections) printServerStatus(name, ok, detail);
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
    await runAgentTurn(conversation, tools, mcp, confirmationGate, {
      onAssistantText: printAssistant,
      onToolCall: printToolCall,
      onToolBlocked: printToolBlocked,
      onToolError: (name, message) => printToolError(`${name}: ${message}`),
      onUsage: printUsage,
    });
  }

  rl.close();
  await mcp.closeAll();
  printGoodbye();
}

main().catch((error) => {
  printFatalError(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
