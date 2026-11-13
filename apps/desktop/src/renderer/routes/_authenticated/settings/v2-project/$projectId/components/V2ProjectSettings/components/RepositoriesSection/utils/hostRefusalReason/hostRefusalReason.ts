/** The host prefixes refusals with a code (`repository_in_use: …`); people read only the reason. */
export function hostRefusalReason(message: string): string {
	return message.replace(/^[a-z]+(?:_[a-z]+)+:\s*/, "");
}
