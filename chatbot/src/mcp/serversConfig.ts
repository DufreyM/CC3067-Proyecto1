import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
 * Official MCP servers used for functionality 4 of the project.
 * - filesystem: @modelcontextprotocol/server-filesystem (npm, sandboxed to workspaceDir)
 * - git: mcp-server-git (PyPI, official Anthropic MCP server for git)
 * Plus the custom local server for functionality 5 (DocFinder).
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
];
