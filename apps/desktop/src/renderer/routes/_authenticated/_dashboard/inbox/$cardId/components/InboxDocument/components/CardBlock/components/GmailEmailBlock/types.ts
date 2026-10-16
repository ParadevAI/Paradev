import type { RouterOutputs } from "@superset/trpc";

type DocumentBlocks = NonNullable<RouterOutputs["inbox"]["document"]["blocks"]>;
type CardBlockData = Extract<DocumentBlocks[number], { type: "card" }>;
export type Resolved = CardBlockData["resolved"];
export type GmailEmailView = Extract<
	NonNullable<Resolved["view"]>,
	{ kind: "gmail.email" }
>;
export type GmailThread = NonNullable<GmailEmailView["thread"]>;
export type GmailMessageView = GmailThread["messages"][number];
export type GmailAddress = GmailMessageView["from"];
export type GmailAttachmentView = GmailMessageView["attachments"][number];
export type GmailLabelView = GmailThread["labels"][number];
