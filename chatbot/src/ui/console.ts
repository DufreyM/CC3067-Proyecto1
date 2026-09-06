import chalk from "chalk";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";

/**
 * Small terminal UI layer (extra credit: UI with HCI considerations).
 *
 * Color choices are semantic, not decorative, so a color always means the
 * same thing everywhere in the session:
 *  - cyan   = the human's own words (calm, neutral - it's their input)
 *  - green  = the assistant's reply (the "successful result" of a turn)
 *  - yellow = something happening in the background (a tool call) - draws
 *             the eye without competing with the actual conversation
 *  - red    = an error or a blocked action
 *  - gray   = system/status noise (startup, connections) - present but
 *             visually de-emphasized so it doesn't compete with the chat
 * This mirrors how the conventional traffic-light palette is read at a
 * glance (green = proceed, yellow = caution, red = stop) instead of an
 * arbitrary set of colors the user has to learn.
 */
const c = {
  user: chalk.cyanBright,
  assistant: chalk.greenBright,
  tool: chalk.yellow,
  toolBlocked: chalk.yellow.bold,
  error: chalk.redBright,
  system: chalk.gray,
  accent: chalk.bold,
  dim: chalk.dim,
};

export function printBanner(): void {
  const title = " CC3067 - Proyecto 1: Chatbot MCP ";
  const width = title.length + 4;
  const border = "-".repeat(width);
  console.log(c.accent(border));
  console.log(c.accent(`| ${title.trim().padEnd(width - 4)} |`));
  console.log(c.accent(border));
  console.log(c.dim('Escribe tu mensaje y presiona enter. Escribe "salir" para terminar.\n'));
}

export function printExampleHints(): void {
  console.log(c.dim("Ejemplos de lo que puedes preguntar:"));
  console.log(c.dim('  - "¿donde esta la documentacion de autenticacion del proyecto X?"  (DocFinder)'));
  console.log(c.dim('  - "¿cuantas habitaciones libres hay hoy?"                          (hotel)'));
  console.log(c.dim('  - "¿cuantos dias de vacaciones tiene el empleado 5?"               (RRHH)'));
  console.log(c.dim('  - "recomiendame un cafe floral para V60"                           (BrewOps)\n'));
}

export function printServerStatus(name: string, ok: boolean, detail: string): void {
  const mark = ok ? c.assistant("[ok]") : c.error("[--]");
  console.log(`${mark} ${c.system(`servidor "${name}" (${detail})`)}`);
}

/** Groups namespaced tool names ("server__tool") by server for a compact summary. */
export function printToolsSummary(tools: Tool[]): void {
  const byServer = new Map<string, number>();
  for (const tool of tools) {
    const server = tool.name.split("__")[0];
    byServer.set(server, (byServer.get(server) ?? 0) + 1);
  }

  console.log(c.system(`\n${tools.length} herramientas MCP disponibles:`));
  for (const [server, count] of byServer) {
    console.log(c.system(`  - ${server}: ${count}`));
  }
  console.log();
}

export function userPromptLabel(): string {
  return c.user.bold("Tu > ");
}

export function printAssistant(text: string): void {
  console.log(`${c.assistant.bold("Bot >")} ${text}\n`);
}

export function printToolCall(name: string, input: Record<string, unknown>): void {
  const shortInput = JSON.stringify(input);
  const truncated = shortInput.length > 120 ? `${shortInput.slice(0, 117)}...` : shortInput;
  console.log(c.tool(`  * ${name} ${c.dim(truncated)}`));
}

export function printToolBlocked(name: string, reason: string): void {
  console.log(c.toolBlocked(`  ! ${name} bloqueada: ${reason}`));
}

export function printToolError(message: string): void {
  console.log(c.error(`  x ${message}`));
}

export function printFatalError(message: string): void {
  console.error(c.error(`\nError fatal: ${message}`));
}

export function printGoodbye(): void {
  console.log(c.system("\nHasta luego."));
}
