import type { ModelCatalog } from "./contracts.ts";
import { contextWindowFor } from "./context-budget.ts";

export const DEFAULT_ROOM_COMPACT_AT = 0.9;

export type RoomMemberContext = { tokens: number; window: number; compactRequested?: true };

export function roomCompactTokens(window: number, settings: { autoCompact?: boolean; roomCompactAt?: number } | undefined): number | null {
  if (settings?.autoCompact === false) return null;
  const at = settings?.roomCompactAt;
  const value = typeof at === "number" && Number.isFinite(at) && at > 0 ? at : DEFAULT_ROOM_COMPACT_AT;
  return value < 1 ? Math.floor(window * value) : Math.floor(value);
}

/** A reading, with the engine its process runs on and when it was taken. */
type Measured = RoomMemberContext & { instanceId?: string; at: number };

export type RoomContextClock = {
  /** How long a quiet warm process lives (sessionIdlePolicy). */
  idleMs: number;
  /** When the room thread's keep-warm hold ends, if it has one. */
  heldUntil?: (threadId: string) => number | undefined;
  now?: () => number;
  /** A reading aged out on its own: the room's banner should update. */
  expired?: (threadId: string) => void;
};

export class RoomContextTracker {
  private threads = new Map<string, Map<string, Measured>>();
  /** The engine each member's latest turn in a thread was dispatched on. */
  private engines = new Map<string, Map<string, string>>();

  private readonly clock: RoomContextClock;

  constructor(clock: RoomContextClock) {
    this.clock = clock;
  }

  record(threadId: string, botId: string, reading: { tokens?: number; window?: number } | undefined, model: string | undefined, catalog?: ModelCatalog): void {
    const tokens = reading?.tokens;
    if (typeof tokens !== "number" || !Number.isFinite(tokens) || tokens <= 0) return;
    const members = this.threads.get(threadId) ?? new Map<string, Measured>();
    const previous = this.live(threadId, botId);
    const instanceId = this.engines.get(threadId)?.get(botId);
    const measured: Measured = {
      tokens: Math.trunc(tokens),
      window: contextWindowFor(model, catalog, reading?.window),
      ...(previous?.compactRequested ? { compactRequested: true as const } : {}),
      ...(instanceId ? { instanceId } : {}),
      at: this.now(),
    };
    members.set(botId, measured);
    this.threads.set(threadId, members);
    this.watch(threadId, botId, measured);
  }

  request(threadId: string, botId: string): boolean {
    const current = this.live(threadId, botId);
    if (!current) return false;
    current.compactRequested = true;
    return true;
  }

  forThread(threadId: string): Record<string, RoomMemberContext> | undefined {
    const members = this.threads.get(threadId);
    if (!members) return undefined;
    for (const botId of members.keys()) this.live(threadId, botId);
    if (!members.size) return undefined;
    return Object.fromEntries([...members].map(([botId, { tokens, window, compactRequested }]) =>
      [botId, { tokens, window, ...(compactRequested ? { compactRequested } : {}) }]));
  }

  /** At dispatch, after takeReset: this member's turn takes the thread's
   * warm process slot on its engine, so the other members measured on that
   * engine lose theirs. Members on another engine keep their process (each
   * engine pools its own). Returns whether any reading went. */
  dispatched(threadId: string, botId: string, instanceId: string): boolean {
    const engines = this.engines.get(threadId) ?? new Map<string, string>();
    engines.set(botId, instanceId);
    this.engines.set(threadId, engines);
    const members = this.threads.get(threadId);
    if (!members) return false;
    let dropped = false;
    for (const [other, reading] of members) {
      // A reading from before its engine was known is assumed to share it.
      if (other === botId || (reading.instanceId && reading.instanceId !== instanceId)) continue;
      members.delete(other);
      dropped = true;
    }
    if (!members.size) this.threads.delete(threadId);
    return dropped;
  }

  takeReset(threadId: string, botId: string, settings: { autoCompact?: boolean; roomCompactAt?: number } | undefined):
    { reason: "requested" | "threshold"; percent: number } | null {
    const current = this.live(threadId, botId);
    const members = this.threads.get(threadId);
    if (!members || !current) return null;
    const percent = Math.round((current.tokens / current.window) * 100);
    const limit = roomCompactTokens(current.window, settings);
    const reason = current.compactRequested ? "requested" : limit !== null && current.tokens >= limit ? "threshold" : null;
    if (!reason) return null;
    members.delete(botId);
    if (!members.size) this.threads.delete(threadId);
    return { reason, percent };
  }

  forget(threadId: string): void {
    this.threads.delete(threadId);
    this.engines.delete(threadId);
  }

  private now(): number {
    return this.clock.now?.() ?? Date.now();
  }

  /** Idle closes count from when the turn settled, which is when the
   * reading was taken; a keep-warm hold can keep the process past that. */
  private warmUntil(threadId: string, reading: Measured): number {
    return Math.max(reading.at + this.clock.idleMs, this.clock.heldUntil?.(threadId) ?? 0);
  }

  /** Tells `expired` once this reading ages out, unless it was replaced or
   * consumed first. The timer never keeps the server alive. */
  private watch(threadId: string, botId: string, reading: Measured): void {
    const expired = this.clock.expired;
    if (!expired) return;
    const check = () => {
      if (this.threads.get(threadId)?.get(botId) !== reading) return;
      if (this.live(threadId, botId)) return arm(this.warmUntil(threadId, reading) - this.now());
      expired(threadId);
    };
    const arm = (ms: number) => {
      const timer = setTimeout(check, Math.min(2_147_483_647, Math.max(0, ms)));
      timer.unref?.();
    };
    arm(this.warmUntil(threadId, reading) - this.now());
  }

  /** A member's reading while its process can still be warm; a stale one
   * is dropped. */
  private live(threadId: string, botId: string): Measured | undefined {
    const members = this.threads.get(threadId);
    const current = members?.get(botId);
    if (!members || !current) return undefined;
    if (this.now() < this.warmUntil(threadId, current)) return current;
    members.delete(botId);
    if (!members.size) this.threads.delete(threadId);
    return undefined;
  }
}
