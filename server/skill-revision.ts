import { createHash, randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { writeFileAtomic } from "./atomic.ts";
import { directoryEntryState, learnedSkillDirectoryMatches } from "./skill-content.ts";

function entryExists(path: string): boolean { try { lstatSync(path); return true; } catch { return false; } }

function directoryIdentity(path: string): { dev: number; ino: number } | null {
  try {
    const stat = lstatSync(path);
    return stat.isDirectory() && !stat.isSymbolicLink() ? { dev: stat.dev, ino: stat.ino } : null;
  } catch {
    return null;
  }
}

function sameDirectoryIdentity(path: string, expected: { dev: number; ino: number }): boolean {
  const current = directoryIdentity(path);
  return current?.dev === expected.dev && current.ino === expected.ino;
}

export function publishReviewedRevision(
  state: string,
  skillsRoot: () => string | null,
  stageId: string,
  files: Array<{ path: string; content: string }>,
  sha256: string,
  referencesSha256: string | undefined,
): string {
  // No agent-writable path is opened until the complete directory is published as one rename.
  mkdirSync(state, { recursive: true, mode: 0o700 });
  if (directoryEntryState(state) !== "directory") {
    throw new Error("the protected skill state path is not a real directory");
  }
  const preparedRoot = join(state, "reviewed-revisions");
  const preparedRootState = directoryEntryState(preparedRoot);
  if (preparedRootState === "unsafe") {
    throw new Error("the protected revision path is not a real directory");
  }
  if (preparedRootState === "missing") mkdirSync(preparedRoot, { mode: 0o700 });
  const revision = createHash("sha256").update(stageId).digest("hex");
  const prepared = join(preparedRoot, revision);
  if (!learnedSkillDirectoryMatches(prepared, sha256, referencesSha256)) {
    if (entryExists(prepared)) {
      if (directoryEntryState(prepared) !== "directory") {
        throw new Error("the protected reviewed revision is not a real directory");
      }
      rmSync(prepared, { recursive: true, force: true });
    }
    const temporary = join(preparedRoot, `.prepare-${revision}-${randomUUID()}`);
    try {
      mkdirSync(temporary, { mode: 0o700 });
      for (const file of files) {
        const path = join(temporary, file.path);
        mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
        writeFileAtomic(path, file.content, { mode: 0o600 });
      }
      if (!learnedSkillDirectoryMatches(temporary, sha256, referencesSha256)) {
        throw new Error("the protected reviewed bytes do not match the approval card");
      }
      renameSync(temporary, prepared);
    } catch (error) {
      rmSync(temporary, { recursive: true, force: true });
      throw error;
    }
  }

  const root = skillsRoot();
  if (!root) throw new Error("the workspace skills path must be a real directory, not a symlink or file");
  const rootIdentity = directoryIdentity(root);
  if (!rootIdentity) throw new Error("the workspace skills path changed during update");
  const revisions = join(root, ".revisions");
  const revisionsState = directoryEntryState(revisions);
  if (revisionsState === "unsafe") throw new Error("the skill revisions path is not a real directory");
  if (revisionsState === "missing") mkdirSync(revisions, { mode: 0o700 });
  const revisionsIdentity = directoryIdentity(revisions);
  if (!revisionsIdentity) throw new Error("the skill revisions path could not be created safely");

  const target = join(revisions, revision);
  if (learnedSkillDirectoryMatches(target, sha256, referencesSha256)) {
    try {
      rmSync(prepared, { recursive: true, force: true });
    } catch {}
    return revision;
  }
  if (entryExists(target)) {
    throw new Error("the reviewed revision path already exists with different content");
  }
  if (!sameDirectoryIdentity(root, rootIdentity) || !sameDirectoryIdentity(revisions, revisionsIdentity)) {
    throw new Error("the workspace skills path changed during update");
  }

  renameSync(prepared, target);
  if (
    !sameDirectoryIdentity(root, rootIdentity) ||
    !sameDirectoryIdentity(revisions, revisionsIdentity) ||
    !learnedSkillDirectoryMatches(target, sha256, referencesSha256)
  ) {
    throw new Error("the reviewed revision changed while it was being published");
  }
  return revision;
}
