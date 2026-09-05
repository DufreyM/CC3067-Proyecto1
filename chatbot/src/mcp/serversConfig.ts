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

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  cwd?: string;
}

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
 * Official MCP servers used for functionality 4 of the project.
 * - filesystem: @modelcontextprotocol/server-filesystem (npm, sandboxed to workspaceDir)
 * - git: mcp-server-git (PyPI, official Anthropic MCP server for git)
 * Plus the custom local server for functionality 5 (DocFinder) and three
 * classmates' servers for functionality 6.
 */
export const mcpServers: McpServerConfig[] = [
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
];
