import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

interface CliOptions {
  host: string;
  port: number;
  cwd?: string;
  command: string;
  args: string[];
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * Wraps ANY existing stdio MCP server - unmodified - and re-exposes it over
 * HTTP on a TCP port, so a chatbot on another machine on the same local
 * network can connect to it the same way it connects to a server it spawns
 * locally. Nothing about the wrapped server (its tools, its language,
 * whether it uses an SDK) needs to change.
 *
 * This hand-rolls the non-streaming subset of the MCP Streamable HTTP
 * transport (plain `application/json` responses instead of SSE, which the
 * spec explicitly allows) rather than using the SDK's server-side
 * StreamableHTTPServerTransport: that class returned bare 500s even in a
 * minimal, otherwise-correct setup on this SDK version, and this project's
 * only network requirement is a simple LAN request/response relay - no
 * resumable streams or server-initiated push needed. The client side still
 * uses the official StreamableHTTPClientTransport unmodified.
 *
 * Usage:
 *   npm start -- --port 4100 [--host 0.0.0.0] [--cwd <dir>] -- <command> [args...]
 */
function parseArgs(argv: string[]): CliOptions {
  const separatorIndex = argv.indexOf("--");
  if (separatorIndex === -1 || separatorIndex === argv.length - 1) {
    throw new Error(
      "Uso: npm start -- --port <puerto> [--host <host>] [--cwd <dir>] -- <comando> [args...]\n" +
        "Ejemplo: npm start -- --port 4100 -- python -m hotel_mcp",
    );
  }

  const flags = argv.slice(0, separatorIndex);
  const [command, ...args] = argv.slice(separatorIndex + 1);

  let host = "0.0.0.0";
  let port = 4100;
  let cwd: string | undefined;

  for (let i = 0; i < flags.length; i += 1) {
    switch (flags[i]) {
      case "--host":
        host = flags[++i];
        break;
      case "--port":
        port = Number(flags[++i]);
        break;
      case "--cwd":
        cwd = flags[++i];
        break;
      default:
        throw new Error(`Flag desconocida: ${flags[i]}`);
    }
  }

  if (!command) throw new Error("Falta el comando del servidor MCP a envolver (despues de --).");
  return { host, port, cwd, command, args };
}

function printLanUrls(port: number): void {
  const interfaces = networkInterfaces();
  console.log(`Escuchando en el puerto ${port}. URLs disponibles:`);
  console.log(`  http://localhost:${port}/mcp   (misma maquina)`);
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        console.log(`  http://${entry.address}:${port}/mcp   (red local, usa esta desde otra maquina)`);
      }
    }
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

async function handleMessage(innerClient: Client, message: JsonRpcRequest): Promise<unknown> {
  switch (message.method) {
    case "initialize":
      return {
        protocolVersion: (message.params?.protocolVersion as string) ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "mcp-network-bridge", version: "0.1.0" },
      };
    case "ping":
      return {};
    case "tools/list":
      return innerClient.listTools(message.params as { cursor?: string } | undefined);
    case "tools/call":
      return innerClient.callTool(message.params as { name: string; arguments?: Record<string, unknown> });
    default:
      throw { code: -32601, message: `Method not found: ${message.method}` };
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const innerClient = new Client({ name: "mcp-network-bridge-client", version: "0.1.0" }, { capabilities: {} });
  const innerTransport = new StdioClientTransport({ command: options.command, args: options.args, cwd: options.cwd });
  await innerClient.connect(innerTransport);
  console.log(`Servidor interno conectado: ${options.command} ${options.args.join(" ")}`);

  const httpServer = createServer(async (req, res) => {
    if (req.method === "GET") {
      // Standalone SSE stream for server-initiated push - unused by this bridge, kept open and idle.
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      req.on("close", () => res.end());
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }

    let message: JsonRpcRequest;
    try {
      message = JSON.parse(await readBody(req));
    } catch {
      sendJson(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      return;
    }

    const isNotification = message.id === undefined;
    try {
      const result = await handleMessage(innerClient, message);
      if (isNotification) {
        res.writeHead(202).end();
      } else {
        sendJson(res, 200, { jsonrpc: "2.0", id: message.id, result });
      }
    } catch (error) {
      if (isNotification) {
        res.writeHead(202).end();
        return;
      }
      const rpcError =
        error && typeof error === "object" && "code" in error
          ? (error as { code: number; message: string })
          : { code: -32000, message: error instanceof Error ? error.message : String(error) };
      sendJson(res, 200, { jsonrpc: "2.0", id: message.id, error: rpcError });
    }
  });

  httpServer.listen(options.port, options.host, () => printLanUrls(options.port));

  const shutdown = async () => {
    console.log("\nCerrando bridge...");
    httpServer.close();
    await innerClient.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Error fatal en mcp-network-bridge:", error);
  process.exit(1);
});
