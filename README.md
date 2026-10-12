# OpenMausBot PR screenshots

All shots come from an isolated dev instance per branch: the repo's fake-engine
verification server (`launchVerificationServer`: temporary data dir and home, free
ports, fake Claude, fake Codex where noted), a Vite dev renderer and headless Chrome,
Daylight (light) skin, 1280px wide at 2x. No real engine or account was used.
"Before" shots use the branches' merge base `069307aa` in a temporary worktree.

## feat/steer-images

- `steer-images/04-claude-picture-steered-live.png`: on Claude, a picture sent while the bot works goes into the running turn ("sent mid-turn").
- `steer-images/01-queued-picture.png`: on an engine that can't take pictures mid-turn (Codex here), the message stays queued, and its row now reads "Use this mockup for the hero section [image]".
- `steer-images/02-steer-images-notice.png`: pressing Steer on it shows a quiet notice instead of doing nothing: "Pictures can't be steered into this bot's running turn. Your message will be sent as the next turn."
- `steer-images/03-before-fix-queued-row-showed-attachment-tag.png`: before the follow-up fix, the queued row showed the raw `<attached-image path="/var/…">` tag.

## feat/room-memory

- `room-memory/01-learn-from-group-chats-off.png`: bot settings → Memory, the new "Learn from group chats" switch under Memory upkeep (off by default).
- `room-memory/02-learn-from-group-chats-on.png`: the same switch turned on.

## feat/auto-skill-review

- `auto-skill-review/01-settings-learn-skills-automatically.png`: Settings → Experimental: "Learn skills automatically" and "Review after this many tool steps".
- `auto-skill-review/02-review-steps-out-of-range.png`: an out-of-range step count is refused inline ("Enter a whole number from 3 to 100.").
- `auto-skill-review/03-skill-receipt-in-chat.png`: after the background review, the chat shows a receipt line with Undo: "Reporter added a skill: weekly-report".
- `auto-skill-review/04-skill-receipt-details.png`: the receipt with Details open.

## feat/team-settings-context-warning

- `team-settings-context-warning/01-team-menu-set-for-all.png`: the team's context menu in the sidebar now has "Set for all bots in this team…".
- `team-settings-context-warning/02-team-settings-preview.png`: the dialog's Approval level tab, with a preview of what each bot gets.
- `team-settings-context-warning/02b-team-settings-model-and-effort.png`: the Model and effort tab.
- `team-settings-context-warning/03-team-settings-result.png`: the result after applying ("3 applied · 0 already set · 0 skipped").
- `team-settings-context-warning/04-chat-header-context-warning.png`: the 1:1 chat header shows "Context 86%" with Compact now.
- `team-settings-context-warning/05-room-context-warning-and-avatar-dot.png`: in a room, the line "Bee's context in this room is 86% full. Compact now", plus a warning dot on Bee's avatar.
- `team-settings-context-warning/06-room-compact-requested.png`: after Compact now: "Compacts before its next turn."

## feat/parallel-room-threads

- `parallel-room-threads/01-room-header-working-elsewhere.png`: Atlas works in the open thread while Bee works in another one. Bee's avatar has a thin ring (tooltip: "Bee is working in another thread"), and "All threads" has a pulsing dot (tooltip: "Working in other threads: 1").
- `parallel-room-threads/02-sidebar-per-thread-busy-rows.png`: each room thread in the sidebar shows its own busy spinner.
- `parallel-room-threads/03-room-overview.png`: both together.
- `parallel-room-threads/00-before-room-header.png`, `00-before-sidebar-rows.png`: before. Only the open thread looked busy, and Bee's work in "Pricing page" didn't show.

## feat/room-stop-and-clean-replies

- `room-stop-and-clean-replies/01-stop-one-member-button.png`: while a member works, "Stop Bee" stops only that member.
- `room-stop-and-clean-replies/02-held-member-banner-and-paused-badge.png`: the banner "Stopped by you: Bee. @mention a bot or say resume to bring it back." with Resume Bee.
- `room-stop-and-clean-replies/03-paused-avatar-badge.png`: the held member's avatar is greyed out with a pause badge.
- `room-stop-and-clean-replies/04-reply-is-final-message-notes-folded.png`: a member's reply is its final message, and its working notes fold into one "Worked" row.
- `room-stop-and-clean-replies/05-working-notes-unfolded.png`: the fold opened.
- `room-stop-and-clean-replies/06-finished-without-summary-chip.png`: a member that ends with no reply gets asked once, then "Quill finished without a summary".
- `room-stop-and-clean-replies/00-before-working-notes-read-as-replies.png`: before. Every working note read as its own reply.

## feat/room-stop-and-clean-replies-stacked (on top of parallel threads)

- `room-stop-and-clean-replies-stacked/01-stop-uses-this-threads-speaker.png`: with two threads working, the Stop button names the open thread's speaker ("Stop Atlas"), while Bee keeps its ring for working elsewhere.
- `room-stop-and-clean-replies-stacked/02-held-in-one-thread-other-thread-keeps-working.png`: after Stop, Atlas is held, while "Pricing page" (Bee) keeps working.

## feat/cache-keepwarm

- `cache-keepwarm/01-settings-keep-prompt-cache-warm.png`: Settings → Model providers, the "Keep prompt cache warm" card with "Keep warm for".
- `cache-keepwarm/02-bot-model-keep-warm-override.png`: the per-bot override in the bot's Model settings ("Same as Settings (On)", On, Off).
- `cache-keepwarm/03-usage-menu-chip.png`: the chat's ⋯ menu with the usage chip. The keep-warm status is a line in the chip's tooltip, which a screenshot can't show. Its text in this run: `cache warm · next ping 7:49 PM · until 9:59 PM`.
