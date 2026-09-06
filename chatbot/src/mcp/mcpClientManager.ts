import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import type { McpLogger } from "../logging/mcpLogger.js";
import { mcpServers, type McpServerConfig } from "./serversConfig.js";

const TOOL_NAME_SEPARATOR = "__";

interface ConnectedServer {
  name: string;
  client: Client;
}

export interface ServerConnectionResult {
  name: string;
  ok: boolean;
  detail: string;
}

/**
 * Connects to every configured MCP server over stdio, exposes their tools to
 * the Anthropic Messages API (namespaced as "<server>__<tool>" to avoid name
 * clashes), and routes tool calls back to the right server while logging
 * every JSON-RPC request/response through McpLogger.
 */
export class McpClientManager {
  private readonly servers: ConnectedServer[] = [];
  private readonly toolOwners = new Map<string, string>();

  constructor(private readonly logger: McpLogger) {}

  async connectAll(configs: McpServerConfig[] = mcpServers): Promise<ServerConnectionResult[]> {
    const results: ServerConnectionResult[] = [];
    for (const serverConfig of configs) {
      if (this.isConnected(serverConfig.name)) {
        results.push({ name: serverConfig.name, ok: true, detail: "ya conectado" });
        continue;
      }
      try {
        const detail = await this.connectServer(serverConfig);
        results.push({ name: serverConfig.name, ok: true, detail });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ name: serverConfig.name, ok: false, detail: message });
      }
    }
    return results;
  }

  /** Connects one server and returns a short description of how (for status display). */
  private async connectServer(serverConfig: McpServerConfig): Promise<string> {
    const client = new Client({ name: `cc3067-chatbot-${serverConfig.name}`, version: "0.1.0" }, { capabilities: {} });
    const transport: Transport =
      serverConfig.transport === "http"
        ? new StreamableHTTPClientTransport(new URL(serverConfig.url))
        : new StdioClientTransport({ command: serverConfig.command!, args: serverConfig.args, cwd: serverConfig.cwd });

    await client.connect(transport);
    this.servers.push({ name: serverConfig.name, client });
    return serverConfig.transport === "http" ? `http, ${serverConfig.url}` : "stdio";
  }

  isConnected(name: string): boolean {
    return this.servers.some((s) => s.name === name);
  }

  /** Closes and forgets the given servers, so a later listAnthropicTools() no longer offers their tools. */
  async disconnectByNames(names: string[]): Promise<void> {
    const toRemove = new Set(names);
    const removed = this.servers.filter((s) => toRemove.has(s.name));
    for (const server of removed) {
      await server.client.close();
    }
    const remaining = this.servers.filter((s) => !toRemove.has(s.name));
    this.servers.length = 0;
    this.servers.push(...remaining);
  }

  async listAnthropicTools(): Promise<Tool[]> {
    this.toolOwners.clear();
    const tools: Tool[] = [];
    for (const server of this.servers) {
      this.logger.log({ serverName: server.name, direction: "request", method: "tools/list", payload: {} });
      const result = await server.client.listTools();
      this.logger.log({ serverName: server.name, direction: "response", method: "tools/list", payload: result });

      for (const tool of result.tools) {
        const qualifiedName = `${server.name}${TOOL_NAME_SEPARATOR}${tool.name}`;
        this.toolOwners.set(qualifiedName, server.name);
        tools.push({
          name: qualifiedName,
          description: `[${server.name}] ${tool.description ?? ""}`,
          input_schema: tool.inputSchema as Tool["input_schema"],
        });
      }
    }
    return tools;
  }

  async callTool(qualifiedName: string, input: Record<string, unknown>): Promise<unknown> {
    const serverName = this.toolOwners.get(qualifiedName);
    if (!serverName) {
      throw new Error(`Herramienta MCP desconocida: ${qualifiedName}`);
    }
    const server = this.servers.find((s) => s.name === serverName);
    if (!server) {
      throw new Error(`Servidor MCP no conectado: ${serverName}`);
    }
    const toolName = qualifiedName.slice(serverName.length + TOOL_NAME_SEPARATOR.length);

    this.logger.log({ serverName, direction: "request", method: `tools/call:${toolName}`, payload: input });
    const result = await server.client.callTool({ name: toolName, arguments: input });
    this.logger.log({ serverName, direction: "response", method: `tools/call:${toolName}`, payload: result });
    return result;
  }

  async closeAll(): Promise<void> {
    for (const server of this.servers) {
      await server.client.close();
    }
  }
}
