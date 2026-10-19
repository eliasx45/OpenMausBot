import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { writeLibraryFiles } from "./skill-library-files.ts";

it("restores the complete previous skill if committing its index fails", () => {
  const root = mkdtempSync(join(tmpdir(), "omb-library-files-"));
  const directory = join(root, "fixture");
  try {
    writeLibraryFiles(directory, "old skill", [{ path: "references/old.md", content: "old reference" }], () => {});
    expect(() => writeLibraryFiles(directory, "new skill", [{ path: "references/new.md", content: "new reference" }], () => { throw new Error("index failed"); })).toThrow("index failed");
    expect(readFileSync(join(directory, "SKILL.md"), "utf8")).toBe("old skill");
    expect(readdirSync(join(directory, "references"))).toEqual(["old.md"]);
    expect(readFileSync(join(directory, "references/old.md"), "utf8")).toBe("old reference");
    expect(readdirSync(root)).toEqual(["fixture"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
