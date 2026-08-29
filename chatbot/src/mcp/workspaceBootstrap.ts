import { existsSync, mkdirSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { workspaceDir } from "./serversConfig.js";

const execFileAsync = promisify(execFile);

/**
 * The published mcp-server-git package does not expose a `git_init` tool
 * (unlike the older reference implementation), so there is no MCP tool the
 * LLM can call to create a brand new repository. We bootstrap an empty repo
 * once here so the git__git_status/add/commit tools have something to work
 * with; everything after that (creating files, staging, committing) is done
 * live by the chatbot through the Filesystem and Git MCP servers.
 */
export async function ensureWorkspaceRepo(): Promise<void> {
  mkdirSync(workspaceDir, { recursive: true });
  if (existsSync(join(workspaceDir, ".git"))) return;

  await execFileAsync("git", ["init"], { cwd: workspaceDir });
  console.log(`[setup] Repositorio git inicializado en ${workspaceDir}`);
}
