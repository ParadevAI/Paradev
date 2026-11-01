import { PENDING_CLOUD_CHAT_PANE_KIND } from "../../types";

export const CENTER_PANE_KINDS: ReadonlySet<string> = new Set([
	"terminal",
	"chat-v3",
	PENDING_CLOUD_CHAT_PANE_KIND,
]);
