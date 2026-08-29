import { mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.js";

export type McpLogDirection = "request" | "response";

export interface McpLogEntry {
  timestamp: string;
  serverName: string;
  direction: McpLogDirection;
  method: string;
  payload: unknown;
}

/**
 * Records every JSON-RPC exchange between the chatbot and each MCP server,
 * both to the console (for live demos) and to a JSONL file (for the report).
 */
export class McpLogger {
  private readonly filePath: string;

  constructor(logDir: string = config.logDir) {
    mkdirSync(logDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.filePath = join(logDir, `mcp-session-${stamp}.jsonl`);
  }

  log(entry: Omit<McpLogEntry, "timestamp">): void {
    const fullEntry: McpLogEntry = { timestamp: new Date().toISOString(), ...entry };
    const arrow = entry.direction === "request" ? "->" : "<-";
    console.log(`[MCP ${arrow} ${entry.serverName}] ${entry.method}`);
    appendFileSync(this.filePath, JSON.stringify(fullEntry) + "\n", "utf-8");
  }
}
