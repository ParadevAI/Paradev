/** The reply as it is sent: the reader's words, a blank line, then one offered time per line. */
export function offerText(reply: string, times: string[]): string {
	const words = reply.trim();
	const list = times.join("\n");
	return words ? `${words}\n\n${list}` : list;
}
