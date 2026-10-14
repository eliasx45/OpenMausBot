import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSkillMd, scanSkillText, SKILL_FILE_MAX_BYTES, type ParsedSkill } from "../shared/skill-md.ts";

export const STAGED_SKILL_FILE_MAX_BYTES = 32 * 1024;

export const MAX_SKILL_REFERENCES = 8;

export const SKILL_REFERENCE_PATH = /^references\/[a-z0-9][a-z0-9-]{0,63}\.md$/;

export function isSkillReferencePath(path: string): boolean {
  return SKILL_REFERENCE_PATH.test(path);
}

export function skillReferencesSha256(files: ReadonlyArray<{ path: string; content: string | Buffer }>): string | undefined {
  const references = files
    .filter((file) => file.path !== "SKILL.md")
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  if (!references.length) return undefined;
  const hash = createHash("sha256");
  for (const file of references) {
    hash.update(`${file.path}\0${createHash("sha256").update(file.content).digest("hex")}\n`);
  }
  return hash.digest("hex");
}

export function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)}KB`;
}

export const REFERENCES_ADVICE =
  "Keep SKILL.md to the core steps and move detail (long rule lists, examples, lookup tables) into " +
  "references/<topic>.md files inside the skill — pass them as skill_manage references — then link each one " +
  "from SKILL.md, for example \"For edge cases, read references/<topic>.md.\"";

export type DirectoryEntryState = "missing" | "directory" | "unsafe";

export function directoryEntryState(path: string): DirectoryEntryState {
  try {
    const stat = lstatSync(path);
    return stat.isDirectory() && !stat.isSymbolicLink() ? "directory" : "unsafe";
  } catch {
    return "missing";
  }
}

export interface PreparedSkillFiles {
  files: Array<{ path: string; content: string }>;
  parsed: ParsedSkill;
  warnings: string[];
  skippedFiles: string[];
}

export function preparedSkillFiles(
  files: Array<{ path: string; content: string }>,
): PreparedSkillFiles | { error: string } {
  const skillMd = files.find((file) => file.path === "SKILL.md" || file.path.endsWith("/SKILL.md"));
  if (!skillMd) return { error: "no SKILL.md found at that location" };
  if (Buffer.byteLength(skillMd.content, "utf8") > SKILL_FILE_MAX_BYTES) {
    return { error: `SKILL.md is larger than ${SKILL_FILE_MAX_BYTES / 1024}KB` };
  }
  const parsed = parseSkillMd(skillMd.content);
  if ("error" in parsed) return parsed;
  const prefix = skillMd.path.slice(0, skillMd.path.length - "SKILL.md".length);
  const skippedFiles = [
    ...new Set(
      files
        .filter((file) => file !== skillMd)
        .map((file) => {
          const relative = file.path.startsWith(prefix) ? file.path.slice(prefix.length) : file.path;
          return relative || file.path;
        }),
    ),
  ];
  const warnings = [
    ...scanSkillText(skillMd.content),
    ...skippedFiles.map((path) => `skipped supporting file "${path}" — v1 imports only SKILL.md`),
  ];
  return { files: [{ path: "SKILL.md", content: skillMd.content }], parsed, warnings, skippedFiles };
}

export function referenceLimitError(files: Array<{ path: string; content: string }>): string | null {
  const references = files.filter((file) => file.path !== "SKILL.md");
  for (const file of references) {
    if (!isSkillReferencePath(file.path)) {
      return `learned skill files must be SKILL.md or references/<topic>.md (lowercase letters, digits, and hyphens), not "${file.path}"`;
    }
    const bytes = Buffer.byteLength(file.content, "utf8");
    if (bytes > STAGED_SKILL_FILE_MAX_BYTES) {
      return `${file.path} must be at most ${STAGED_SKILL_FILE_MAX_BYTES / 1024}KB; it is ${formatKb(bytes)}. Split it into more references/<topic>.md files.`;
    }
  }
  if (new Set(references.map((file) => file.path)).size !== references.length) {
    return "each references/<topic>.md file may appear only once";
  }
  if (references.length > MAX_SKILL_REFERENCES) {
    return `a learned skill may have at most ${MAX_SKILL_REFERENCES} references/<topic>.md files; it would have ${references.length}. Merge related topics.`;
  }
  return null;
}

export function preparedLearnedSkill(
  files: Array<{ path: string; content: string }>,
): PreparedSkillFiles | { error: string } {
  const skillMds = files.filter((file) => file.path === "SKILL.md");
  if (skillMds.length !== 1 || files.some((file) => file.path !== "SKILL.md" && file.path.endsWith("SKILL.md"))) {
    return { error: "learned skills must contain exactly one SKILL.md" };
  }
  const limitError = referenceLimitError(files);
  if (limitError) return { error: limitError };
  const prepared = preparedSkillFiles([skillMds[0]!]);
  if ("error" in prepared) return prepared;
  const references = files
    .filter((file) => file.path !== "SKILL.md")
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((file) => ({ path: file.path, content: file.content }));
  return {
    ...prepared,
    files: [prepared.files[0]!, ...references],
    warnings: [
      ...prepared.warnings,
      ...references.flatMap((file) => scanSkillText(file.content).map((warning) => `${file.path}: ${warning}`)),
    ],
  };
}

export function readReferenceFiles(directory: string): Array<{ path: string; content: string }> | null {
  const references = join(directory, "references");
  if (directoryEntryState(references) !== "directory") return null;
  const names = readdirSync(references).sort();
  if (!names.length || names.length > MAX_SKILL_REFERENCES) return null;
  const files: Array<{ path: string; content: string }> = [];
  for (const name of names) {
    const path = `references/${name}`;
    if (!isSkillReferencePath(path)) return null;
    const stat = lstatSync(join(references, name));
    if (!stat.isFile() || stat.size > STAGED_SKILL_FILE_MAX_BYTES) return null;
    files.push({ path, content: readFileSync(join(references, name), "utf8") });
  }
  return files;
}

export function learnedSkillDirectoryMatches(directory: string, sha256: string, referencesSha256?: string): boolean {
  if (directoryEntryState(directory) !== "directory") return false;
  try {
    const entries = readdirSync(directory).sort();
    const expected = referencesSha256 ? ["SKILL.md", "references"] : ["SKILL.md"];
    if (entries.length !== expected.length || entries.some((entry, index) => entry !== expected[index])) return false;
    const file = join(directory, "SKILL.md");
    if (!lstatSync(file).isFile()) return false;
    if (createHash("sha256").update(readFileSync(file)).digest("hex") !== sha256) return false;
    if (!referencesSha256) return true;
    const references = readReferenceFiles(directory);
    return references !== null && skillReferencesSha256(references) === referencesSha256;
  } catch {
    return false;
  }
}
