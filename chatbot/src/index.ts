import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { sendMessage } from "./llm/anthropicClient.js";
import { ConversationManager } from "./session/conversationManager.js";

const EXIT_COMMANDS = new Set(["salir", "exit", "quit"]);

async function main() {
  const conversation = new ConversationManager();
  const rl = createInterface({ input: stdin, output: stdout });

  console.log("Chatbot MCP - CC3067 Proyecto 1");
  console.log('Escribe tu mensaje (o "salir" para terminar).\n');

  while (true) {
    const userInput = (await rl.question("Tu > ")).trim();
    if (EXIT_COMMANDS.has(userInput.toLowerCase())) break;
    if (!userInput) continue;

    conversation.addUserMessage(userInput);

    const response = await sendMessage({ history: conversation.getHistory() });
    conversation.addAssistantMessage(response.content);

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    console.log(`Bot > ${text}\n`);
  }

  rl.close();
  console.log("Hasta luego.");
}

main().catch((error) => {
  console.error("Error fatal en el chatbot:", error);
  process.exit(1);
});
