import type { RouterOutputs } from "@superset/trpc";

type DocumentBlocks = NonNullable<RouterOutputs["inbox"]["document"]["blocks"]>;
type CardBlockData = Extract<DocumentBlocks[number], { type: "card" }>;
type ThreadView = Extract<
	NonNullable<CardBlockData["resolved"]["view"]>,
	{ kind: "slack.thread" }
>;
export type SlackMessageView = ThreadView["messages"][number];
export type SlackAttachmentView = SlackMessageView["attachments"][number];
export type SlackBlockView = SlackMessageView["blocks"][number];
export type SlackReaction = SlackMessageView["reactions"][number];

/** Toggles the reader's reaction; absent when they have no Slack account of their own. */
export type ReactFn = (ts: string, name: string, remove: boolean) => void;
export type SlackButtonView = SlackAttachmentView["buttons"][number];
export type SlackPersonView = SlackMessageView["user"];
export type SlackFileView = SlackMessageView["files"][number];
