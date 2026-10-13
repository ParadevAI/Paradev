/**
 * Quotes one word for the remote login shell ssh hands commands to. Uses no
 * backslashes, so fish reads it the same as POSIX shells.
 */
export function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}
