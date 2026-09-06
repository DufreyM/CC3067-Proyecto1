import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWindows = process.platform === "win32";

/** Path to the interpreter inside a venv created with `python -m venv .venv`. */
function venvPython(repoPath: string): string {
  return isWindows ? join(repoPath, ".venv", "Scripts", "python.exe") : join(repoPath, ".venv", "bin", "python");
}

/**
 * Sandbox directory exposed to the Filesystem and Git MCP servers so the
 * chatbot can only read/write/commit inside this folder, not the whole disk.
 */
export const workspaceDir = resolve(__dirname, "../../workspace");

export type McpServerConfig =
  | { name: string; transport?: "stdio"; command: string; args?: string[]; cwd?: string }
  | { name: string; transport: "http"; url: string };

/**
 * DocFinder (functionality 5) lives in its own public repo, as required by
 * the assignment, and is expected to be cloned next to this project by
 * default. Override with DOCFINDER_SERVER_PATH if you cloned it elsewhere.
 * Repo: https://github.com/DufreyM/CC3067-Proyecto1-docfinder
 */
const docfinderPath = process.env.DOCFINDER_SERVER_PATH ?? resolve(__dirname, "../../../../docfinder-mcp-server");

/**
 * Functionality 6: two (here, three) classmates' local MCP servers, chosen
 * from https://github.com/NESHGP04/mcp-server-rrhh-construccion,
 * https://github.com/JosFer720/hotel-mcp-server and
 * https://github.com/Jonialen/brewops-mcp. Each is expected to be cloned as a
 * sibling of this project under external-mcp-servers/, with its own
 * README-documented setup already done (venv + pip install, or `go build`).
 * Every path below can be overridden with an env var for a different layout.
 */
const externalServersDir = resolve(__dirname, "../../../../external-mcp-servers");

const hotelPath = process.env.HOTEL_SERVER_PATH ?? join(externalServersDir, "hotel-mcp-server");
const rrhhPath = process.env.RRHH_SERVER_PATH ?? join(externalServersDir, "mcp-server-rrhh-construccion");
const brewopsBinary =
  process.env.BREWOPS_SERVER_BINARY ??
  join(externalServersDir, "brewops-mcp", isWindows ? "brewops.exe" : "brewops");

/**
 * A 4th classmate's server (library catalogue), from a full project repo
 * (https://github.com/tismajo/CC3067-Proyecto1) rather than an independent
 * one. Its stdio server lives at backend/mcp_servers/local_library and needs
 * a real MySQL database - see README "Servidor de biblioteca (tismajo)" for
 * how to provision one with Docker; it is not self-seeding like the other
 * three. Expected to be cloned under external-mcp-servers/tismajo-proyecto1.
 */
const bibliotecaBackendPath =
  process.env.BIBLIOTECA_SERVER_PATH ?? join(externalServersDir, "tismajo-proyecto1", "backend");

/**
 * Own servers: the official ones (functionality 4) plus DocFinder
 * (functionality 5). Most of the grading and all of the day-to-day
 * development is about these, so they are always connected.
 */
const ownServers: McpServerConfig[] = [
  {
    name: "filesystem",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", workspaceDir],
  },
  {
    name: "git",
    command: "python",
    args: ["-m", "mcp_server_git"],
    cwd: workspaceDir,
  },
  {
    name: "docfinder",
    command: "npx",
    args: ["tsx", "src/index.ts"],
    cwd: docfinderPath,
  },
];

/**
 * Classmates' servers (functionality 6, worth one point). Off by default so
 * daily runs don't need Python venvs, Go, Docker/MySQL and the network
 * bridge all up just to chat with your own stuff - set
 * ENABLE_CLASSMATE_SERVERS=true in .env when you actually want to demo this
 * functionality.
 */
const classmateServers: McpServerConfig[] = [
  {
    name: "hotel",
    command: process.env.HOTEL_SERVER_PYTHON ?? venvPython(hotelPath),
    args: ["-m", "hotel_mcp"],
    cwd: hotelPath,
  },
  {
    name: "rrhh",
    command: process.env.RRHH_SERVER_PYTHON ?? venvPython(rrhhPath),
    args: ["server.py"],
    cwd: rrhhPath,
  },
  {
    name: "brewops",
    command: brewopsBinary,
  },
  {
    name: "biblioteca",
    command: process.env.BIBLIOTECA_SERVER_PYTHON ?? venvPython(bibliotecaBackendPath),
    args: ["-m", "mcp_servers.local_library.server"],
    cwd: bibliotecaBackendPath,
  },
  {
    // Revised functionality 6: connect to a classmate's MCP server "as if
    // remote", over the local network, using the exact same tool-calling
    // code path as every stdio server above - only the transport differs.
    // Run tools/mcp-network-bridge in front of any of the three stdio
    // servers to produce this URL (see that tool's README); for a real LAN
    // demo across two machines, point MCP_REMOTE_URL at the host's LAN IP
    // instead of localhost.
    name: "hotel-remote",
    transport: "http",
    url: process.env.MCP_REMOTE_URL ?? "http://localhost:4100/mcp",
  },
];

const classmateServersEnabled = process.env.ENABLE_CLASSMATE_SERVERS === "true";

export const mcpServers: McpServerConfig[] = [...ownServers, ...(classmateServersEnabled ? classmateServers : [])];
