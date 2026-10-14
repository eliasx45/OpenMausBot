import type { BotRecord, GroupRecord, Store } from "../store.ts";

export function eligibleRecallThreads(store: Store, from: BotRecord, roomFeedsBot: (room: GroupRecord, bot: BotRecord) => boolean, allowed: (threadId: string) => boolean): { roomByThread: Map<string, GroupRecord>; ownThreads: string[] } {
  const roomByThread = new Map<string, GroupRecord>();
  for (const group of store.groups) {
    // A room fewer people can see than this bot stays out of its recall
    // (bot-visibility.ts roomFeeds): its lines would otherwise reach them.
    if (!group.memberIds.includes(from.id) || !roomFeedsBot(group, from)) continue;
    roomByThread.set(group.threadId, group);
    for (const task of group.tasks ?? []) roomByThread.set(task.threadId, group);
  }
  const ownThreads = [...new Set([from.threadId, ...(from.tasks ?? []).map((task) => task.threadId), ...roomByThread.keys()])]
    // On a Cloud home a turn that may use the lent Mac recalls only the
    // conversations the owner alone opened and wrote in.
    .filter(allowed);
  return { roomByThread, ownThreads };
}
