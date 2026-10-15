import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnCli } from "../procs.ts";

type BackgroundFlag = "--tools" | "--no-session-persistence" | "--strict-mcp-config" | "--setting-sources";

export const BACKGROUND_CALL_TIMEOUT_MS = 60_000;

export function backgroundCallArgs(input: {
  model: string;
  outputFormat: "json" | "text";
  supports: (flag: BackgroundFlag) => boolean;
  isolated: boolean;
}): string[] {
  const args = ["-p", "--model", input.model, "--output-format", input.outputFormat];
  if (input.supports("--tools")) args.push("--tools", "");
  if (input.supports("--no-session-persistence")) args.push("--no-session-persistence");
  if (input.isolated) {
    if (input.supports("--strict-mcp-config")) args.push("--strict-mcp-config");
    if (input.supports("--setting-sources")) args.push("--setting-sources", "project");
  }
  return args;
}

export const CLAUDE_BASH_MAX_TIMEOUT_MS = 10 * 60_000;
/** Runs in an empty temp folder so no project settings or files leak in; the caller removes it once settled. */
export function spawnBackgroundCall(cli: string, args: string[], env: NodeJS.ProcessEnv) {
  const cwd = mkdtempSync(join(tmpdir(), "omb-claude-background-"));
  const removeCwd = () => { try { rmSync(cwd, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {} };
  try {
    return { child: spawnCli(cli, args, { cwd, stdio: ["pipe", "pipe", "pipe"], env }), removeCwd };
  } catch (error) {
    removeCwd();
    throw error;
  }
}
