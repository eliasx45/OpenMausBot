import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, openSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { launchVerificationServer, verificationServerEnvironment } from "../scripts/control-omb.ts";
import { waitForExit } from "./testing/cleanup.ts";

it("shares references through the real skill route, checks the complete revision and restores it through Undo", async () => {
  const fixture = await launchVerificationServer();
  let child: ChildProcess | undefined;
  const capability = "shared-reference-fixture";
  const api = async (path: string, method = "GET", body?: unknown, token?: string, expected = 200): Promise<any> => {
    const response = await fetch(fixture.info.url + path, { method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20_000) });
    const value = await response.json();
    expect(response.status, `${method} ${path}: ${JSON.stringify(value)}`).toBe(expected);
    return value;
  };
  try {
    await waitForExit(fixture.child, { signal: "SIGTERM" });
    const log = openSync(fixture.info.logPath, "a", 0o600);
    child = spawn(process.execPath, ["--experimental-strip-types", fileURLToPath(new URL("./index.ts", import.meta.url))], {
      cwd: fileURLToPath(new URL("..", import.meta.url)), stdio: ["ignore", log, log],
      env: { ...verificationServerEnvironment({}, fixture.info.dataDir, Number(new URL(fixture.info.url).port)), OMB_TEST_INTERNAL_CAPABILITY_KEY: capability },
    });
    closeSync(log);
    await expect.poll(async () => { try { return (await fetch(fixture.info.url + "/api/health")).ok; } catch { return false; } }, { timeout: 30_000 }).toBe(true);
    await api("/api/config", "PATCH", { features: { skillsLibrary: true, shareLearnedSkills: "auto" } });
    const { bot: author } = await api("/api/bots", "POST", { name: "Reference author", section: "Editing" }, undefined, 201);
    const { bot: mate } = await api("/api/bots", "POST", { name: "Reference reader", section: "Editing" }, undefined, 201);
    const tokenFor = async (bot: { id: string; threadId: string }) => {
      const response = await fetch(fixture.info.url + "/api/testing/internal-capability", { method: "POST",
        headers: { "content-type": "application/json", "x-openmausbot-test-capability": capability },
        body: JSON.stringify({ botId: bot.id, threadId: bot.threadId, kind: "agents", skillAuthoring: true }) });
      expect(response.status).toBe(201);
      return ((await response.json()) as { token: string }).token;
    };
    const authorToken = await tokenFor(author);
    const mateToken = await tokenFor(mate);
    const skillMd = "---\nname: reference-edit\ndescription: Makes an edit using the approved notes.\n---\nRead references/notes.md before editing.\n";
    const stage = (bot: { id: string; threadId: string }, token: string, body: unknown, status = 201) => api("/api/internal/skills/stage", "POST", {
      fromBotId: bot.id, fromThreadId: bot.threadId, source: "conversation", skill_md: skillMd, ...(body as object),
    }, token, status);
    await stage(author, authorToken, { action: "create", references: [{ path: "references/notes.md", content: "Original reviewed notes" }] });
    const file = join(fixture.info.dataDir, "skills-library", "skills", "reference-edit", "references", "notes.md");
    expect(readFileSync(file, "utf8")).toBe("Original reviewed notes");
    const listing = await api(`/api/internal/skills?fromBotId=${mate.id}&fromThreadId=${mate.threadId}`, "GET", undefined, mateToken);
    const original = listing.skills.find((skill: { name: string }) => skill.name === "reference-edit");
    expect(original.editable).toBe(true);
    expect(original.revision).toHaveLength(12);
    await stage(mate, mateToken, { action: "update", skill_name: "reference-edit", base_revision: original.revision,
      references: [{ path: "references/notes.md", content: "New reviewed notes" }] });
    expect(readFileSync(file, "utf8")).toBe("New reviewed notes");
    await stage(mate, mateToken, { action: "update", skill_name: "reference-edit", base_revision: original.revision,
      references: [{ path: "references/notes.md", content: "Stale overwrite" }] }, 422);
    const transcript = await api(`/api/threads/${mate.threadId}/messages`);
    const card = transcript.messages.findLast((message: any) => message.card?.skillRequest?.shared)?.card;
    expect(card.skillRequest.references[0].content).toBe("New reviewed notes");
    expect(card.skillRequest.previous.references[0].content).toBe("Original reviewed notes");
    expect(await api(`/api/threads/${mate.threadId}/undo`, "POST", { requestId: card.requestId })).toMatchObject({ undone: true });
    expect(readFileSync(file, "utf8")).toBe("Original reviewed notes");
  } finally {
    if (child) await waitForExit(child, { signal: "SIGTERM" });
    await fixture.close();
  }
}, 120_000);
