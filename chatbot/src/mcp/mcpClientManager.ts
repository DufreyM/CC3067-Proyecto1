import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import type { McpLogger } from "../logging/mcpLogger.js";
import { mcpServers, type McpServerConfig } from "./serversConfig.js";
import { printServerStatus } from "../ui/console.js";

const TOOL_NAME_SEPARATOR = "__";

interface ConnectedServer {
  name: string;
  client: Client;
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

  async connectAll(configs: McpServerConfig[] = mcpServers): Promise<void> {
    for (const serverConfig of configs) {
      try {
        await this.connectServer(serverConfig);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        printServerStatus(serverConfig.name, false, message);
      }
    }
  }

  private async connectServer(serverConfig: McpServerConfig): Promise<void> {
    const client = new Client({ name: `cc3067-chatbot-${serverConfig.name}`, version: "0.1.0" }, { capabilities: {} });
    const transport: Transport =
      serverConfig.transport === "http"
        ? new StreamableHTTPClientTransport(new URL(serverConfig.url))
        : new StdioClientTransport({ command: serverConfig.command!, args: serverConfig.args, cwd: serverConfig.cwd });

    await client.connect(transport);
    this.servers.push({ name: serverConfig.name, client });
    const via = serverConfig.transport === "http" ? `http, ${serverConfig.url}` : "stdio";
    printServerStatus(serverConfig.name, true, via);
  }

  async listAnthropicTools(): Promise<Tool[]> {
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
