import type { Notification, NotifyKind } from "../shared/notification.ts";
import { personMentionExcerpt } from "../shared/person-mention.ts";

export type { Notification, NotifyKind } from "../shared/notification.ts";

export function summarize(text: string, max = 140): string {
  const line = text.replace(/```[\s\S]*?```/g, " ").replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

export interface NotifyBot {
  id: string;
  name: string;
  threadId: string;
  notifications?: boolean;
}

export function buildSpendNotification(
  bot: Pick<NotifyBot, "id" | "name">,
  threadId: string,
  text: { title: string; body: string },
): Notification {
  return { kind: "spend", botId: bot.id, botName: bot.name, threadId, title: text.title, body: summarize(text.body, 200) };
}

export function buildNotification(
  kind: NotifyKind,
  bot: NotifyBot,
  threadId: string,
  detail: string,
  extra?: { avatarUrl?: string; group?: { id: string; name: string }; site?: string },
): Notification | null {
  if (bot.notifications === false) return null;

  const body = summarize(detail);
  const who = extra?.group ? `${bot.name} in ${extra.group.name}` : bot.name;
  const title =
    kind === "approval"
      ? `${who} needs approval`
      : kind === "question"
        ? `${who} has a question`
        : kind === "sign-in"
          ? `${who} needs you to sign in to ${extra?.site ?? "a website"}`
          : kind === "routine-failed"
            ? `${who}'s routine failed`
            : kind === "routine-deferred"
              ? `${who}'s routine is waiting`
            : kind === "turn-failed"
              ? `${who} couldn't start`
              : kind === "incident"
                ? `${who} hit a problem`
                : kind === "delegation-settled"
                  ? `${who} resumed with results`
                  : kind === "mention"
                    ? `${who} mentioned you`
                    : `${who} finished`;

  if ((kind === "done" || kind === "mention") && !body) return null;

  const notification: Notification = { kind, botId: bot.id, botName: bot.name, threadId, title, body };
  if (extra?.avatarUrl) notification.avatarUrl = extra.avatarUrl;
  if (extra?.group) notification.groupId = extra.group.id;
  return notification;
}

/** A settled room reply that tags the person (`@you`, or their profile name)
 * is the room asking for them. Room turns never send "done", so this is the
 * turn's one buzz; the caller leaves out bot-to-bot channels, which have no
 * person to ask. Every text the speaker posted this turn counts (a reply can
 * arrive in parts, and each part is shown to the person), and a visible room
 * member's name wins over the person's, as the renderer does. */
export function buildMentionNotification(input: {
  bot: NotifyBot & { avatarUrl?: string };
  group: { id: string; name: string };
  turnId?: string;
  reply: string;
  messages: readonly { role: string; kind: string; text?: string; turnId?: string; from?: { botId: string } }[];
  members: readonly ({ name: string; hidden?: boolean } | null | undefined)[];
  profileName?: string;
}): Notification | null {
  const { bot, group, turnId } = input;
  const texts = turnId
    ? input.messages.filter((m) => m.role === "bot" && m.kind === "text" && m.turnId === turnId && m.from?.botId === bot.id).map((m) => m.text ?? "")
    : [input.reply];
  const botNames = input.members.flatMap((member) => (member && !member.hidden ? [member.name] : []));
  for (const text of texts) {
    const excerpt = personMentionExcerpt(text, { profileName: input.profileName, botNames });
    if (excerpt) return buildNotification("mention", bot, bot.threadId, excerpt, { avatarUrl: bot.avatarUrl, group });
  }
  return null;
}
