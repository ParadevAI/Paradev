export type InboxTone = "neutral" | "good" | "warn" | "bad" | "done";

/** The pill colours an integration's status and notices use, on the card and in the panel. */
export const INBOX_TONE: Record<InboxTone, string> = {
	neutral: "bg-muted text-muted-foreground",
	good: "bg-success/15 text-success",
	warn: "bg-warning/15 text-warning",
	bad: "bg-destructive/15 text-destructive",
	done: "bg-muted text-muted-foreground line-through",
};
