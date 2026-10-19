import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { referenceLimitError } from "./skill-storage.ts";

export function writeLibraryFiles(directory: string, instructions: string, references: Array<{ path: string; content: string }>, commit: () => void): void {
  const error = referenceLimitError(references);
  if (error) throw new Error(error);
  const staged = `${directory}.next-${randomUUID()}`;
  const backup = `${directory}.previous-${randomUUID()}`;
  let moved = false;
  let published = false;
  try {
    mkdirSync(staged, { recursive: true, mode: 0o700 });
    for (const file of [{ path: "SKILL.md", content: instructions }, ...references]) {
      const target = join(staged, file.path);
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      writeFileSync(target, file.content, { mode: 0o600 });
    }
    if (existsSync(directory)) {
      if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) throw new Error("Unsafe library skill directory");
      renameSync(directory, backup);
      moved = true;
    }
    renameSync(staged, directory);
    published = true;
    commit();
  } catch (error) {
    if (published) rmSync(directory, { recursive: true, force: true });
    if (moved) renameSync(backup, directory);
    throw error;
  } finally {
    rmSync(staged, { recursive: true, force: true });
  }
  if (moved) {
    try { rmSync(backup, { recursive: true, force: true }); } catch { /* A committed revision remains valid if old-copy cleanup fails. */ }
  }
}
