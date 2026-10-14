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
