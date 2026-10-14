// @vitest-environment happy-dom
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { Bot } from "@/state/store";
import type { ServerFrame } from "../../shared/wire";
import { publishLiveFrame } from "@/lib/live-events";
import { ActivityPanel } from "./ActivityPanel";

vi.mock("@/state/store", () => ({ useStore: () => ({ dispatch: vi.fn() }) }));
vi.mock("./DesktopCapabilities", () => ({ useCaptionChrome: () => ({ padClass: "", dragProps: {} }) }));

it("keeps a pending activity refresh when task status changes without changing its thread", async () => {
  vi.useFakeTimers();
  const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rows: [] }) });
  vi.stubGlobal("fetch", request);
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = (busy: boolean) => flushSync(() => root.render(createElement(ActivityPanel, {
    bot: { id: "bot", name: "Fixture", threadId: "thread", tasks: [{ threadId: "thread", busy }] } as Bot,
  })));
  try {
    render(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(request).toHaveBeenCalledTimes(1);
    publishLiveFrame({ kind: "runtime", event: { type: "turn.completed", threadId: "thread" } } as ServerFrame);
    render(false);
    await vi.advanceTimersByTimeAsync(400);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0]).toBe("/api/bots/bot/activity?limit=300");
    publishLiveFrame({ kind: "runtime", event: { type: "turn.completed", threadId: "another-bot" } } as ServerFrame);
    await vi.advanceTimersByTimeAsync(400);
    expect(request).toHaveBeenCalledTimes(2);
  } finally {
    flushSync(() => root.unmount());
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
