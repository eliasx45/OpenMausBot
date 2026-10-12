// Daily build (elias/daily) only: this build shares ~/.openmausbot with the
// released OpenMausBot v0.1.107, which ignores the WHOLE config.json on any
// schema error. Every setting this build adds must leave a config.json that
// v0.1.107's own parser accepts; what it rejects lives in config.dev.json.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { DATA_DIR, DEV_CONFIG_FILE, ensureDirs, loadConfig, saveConfig } from "./config.ts";
import { parseStoredConfig as parseReleasedConfig } from "./testing/released-config-v0.1.107.ts";
import { parseStoredMcpServer as parseReleasedMcpServer } from "./testing/released-mcp-registry-v0.1.107.ts";

const configFile = () => join(DATA_DIR, "config.json");
const devFile = () => join(DATA_DIR, DEV_CONFIG_FILE);
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"));

/** Every setting the daily build can write that v0.1.107 did not have:
 * upstream main since v0.1.107 and the seven integrated branches. */
function saveEveryNewSetting(): void {
  saveConfig({
    // feat/room-memory, feat/auto-skill-review
    features: { skillAuthoring: true, roomMemoryCapture: true, skillReview: true, skillReviewSteps: 25 },
    // feat/team-settings-context-warning
    context: { autoCompact: true, roomCompactAt: 0.8 },
    // feat/cache-keepwarm
    cacheKeepWarm: { enabled: true, windowMinutes: 60 },
    // upstream: Groq and Meta workspace connections, My Chrome browser profiles
    groq: { url: "https://api.groq.com/openai/v1" },
    meta: { url: "https://api.meta.ai/v1" },
    browserProfiles: [{ id: "work", name: "Work", browser: "chrome" }, { id: "home", name: "Home" }],
    rooms: { turnTimeoutMinutes: 30 },
    threads: { maxConcurrentPerBot: 4 },
  });
}

describe("config shared with the released v0.1.107", () => {
  beforeEach(() => {
    rmSync(DATA_DIR, { recursive: true, force: true });
    mkdirSync(DATA_DIR, { recursive: true });
  });

  it("leaves a config.json v0.1.107 accepts with every new setting on", () => {
    saveEveryNewSetting();
    const released = readJson(configFile());
    expect(() => parseReleasedConfig(released)).not.toThrow();
    // v0.1.107 still sees the profiles themselves, only not My Chrome
    expect(parseReleasedConfig(released).browserProfiles).toEqual([{ id: "work", name: "Work" }, { id: "home", name: "Home" }]);
    expect(readJson(devFile())).toEqual({ browserProfiles: { work: { browser: "chrome" } } });
  });

  it("would break v0.1.107 without the split (the fixture really is strict)", () => {
    saveEveryNewSetting();
    const full = loadConfig();
    expect(() => parseReleasedConfig(JSON.parse(JSON.stringify({ browserProfiles: full.browserProfiles })))).toThrow();
  });

  it("reads config.dev.json back over config.json", () => {
    saveEveryNewSetting();
    const cfg = loadConfig();
    expect(cfg.browserProfiles).toEqual([{ id: "work", name: "Work", browser: "chrome" }, { id: "home", name: "Home" }]);
    expect(cfg.features).toMatchObject({ roomMemoryCapture: true, skillReview: true, skillReviewSteps: 25 });
    expect(cfg.context?.roomCompactAt).toBe(0.8);
    expect(cfg.cacheKeepWarm).toEqual({ enabled: true, windowMinutes: 60 });

    // a later save keeps the overlay, and switching My Chrome off removes the side file
    saveConfig({ language: "de" });
    expect(loadConfig().browserProfiles?.[0]).toEqual({ id: "work", name: "Work", browser: "chrome" });
    saveConfig({ browserProfiles: [{ id: "work", name: "Work" }, { id: "home", name: "Home" }] });
    expect(existsSync(devFile())).toBe(false);
    expect(loadConfig().browserProfiles?.[0]).toEqual({ id: "work", name: "Work" });
  });

  it("follows edits the released app makes to config.json", () => {
    saveEveryNewSetting();
    const released = readJson(configFile());
    // v0.1.107 renames "work" and deletes "home"; it never sees config.dev.json
    released.browserProfiles = [{ id: "work", name: "Office" }];
    writeFileSync(configFile(), JSON.stringify(released, null, 2));
    expect(loadConfig().browserProfiles).toEqual([{ id: "work", name: "Office", browser: "chrome" }]);
  });

  it("moves values v0.1.107 rejects out of an existing config.json at boot", () => {
    writeFileSync(configFile(), JSON.stringify({
      profile: { name: "Elias" },
      browserProfiles: [{ id: "work", name: "Work", browser: "chrome" }],
    }, null, 2));
    expect(() => parseReleasedConfig(readJson(configFile()))).toThrow();
    ensureDirs();
    expect(() => parseReleasedConfig(readJson(configFile()))).not.toThrow();
    expect(readJson(configFile())).toEqual({ profile: { name: "Elias" }, browserProfiles: [{ id: "work", name: "Work" }] });
    expect(loadConfig().browserProfiles).toEqual([{ id: "work", name: "Work", browser: "chrome" }]);
    // a config.json that is already fine is not rewritten
    const before = readFileSync(configFile(), "utf8");
    ensureDirs();
    expect(readFileSync(configFile(), "utf8")).toBe(before);
  });

  it("keeps a per-server MCP result budget out of the released app's config.json", () => {
    saveConfig({ mcpServers: { "effectcraft-app": { command: "effectcraft-mcp", args: ["--bridge", "9877"], resultBudget: 40_000 } } });
    const released = readJson(configFile());
    expect(() => parseReleasedConfig(released)).not.toThrow();
    // v0.1.107's registry (strict entry schemas) still loads the server itself
    expect(released.mcpServers["effectcraft-app"]).toEqual({ command: "effectcraft-mcp", args: ["--bridge", "9877"] });
    expect(parseReleasedMcpServer("effectcraft-app", released.mcpServers["effectcraft-app"]).ok).toBe(true);
    expect(parseReleasedMcpServer("effectcraft-app", { ...released.mcpServers["effectcraft-app"], resultBudget: 40_000 }).ok).toBe(false);
    expect(readJson(devFile())).toEqual({ mcpServers: { "effectcraft-app": { resultBudget: 40_000 } } });
    expect(loadConfig().mcpServers?.["effectcraft-app"]).toEqual({ command: "effectcraft-mcp", args: ["--bridge", "9877"], resultBudget: 40_000 });

    // the released app deletes the server: the budget is not revived as a stub
    writeFileSync(configFile(), JSON.stringify({ ...released, mcpServers: {} }, null, 2));
    expect(loadConfig().mcpServers).toEqual({});
  });

  it("moves an MCP result budget out of an existing config.json at boot", () => {
    writeFileSync(configFile(), JSON.stringify({
      mcpServers: { "effectcraft-app": { command: "effectcraft-mcp", resultBudget: 40_000 } },
    }, null, 2));
    ensureDirs();
    expect(readJson(configFile())).toEqual({ mcpServers: { "effectcraft-app": { command: "effectcraft-mcp" } } });
    expect(loadConfig().mcpServers?.["effectcraft-app"]).toEqual({ command: "effectcraft-mcp", resultBudget: 40_000 });
  });
});
