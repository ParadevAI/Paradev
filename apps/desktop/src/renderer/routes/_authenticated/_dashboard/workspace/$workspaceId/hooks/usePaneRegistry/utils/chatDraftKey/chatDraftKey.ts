/** Where a chat pane's composer draft is kept: the pane's draft id, or its terminal id. */
export function chatDraftKey(id: string): string {
	return `chat-v3-draft:${id}`;
}
