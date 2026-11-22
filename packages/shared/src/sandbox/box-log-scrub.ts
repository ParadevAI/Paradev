/** Shorter values are ordinary words and numbers (`PORT=3000`, `true`), not secrets. */
const MIN_SECRET_LENGTH = 8;

const TOKEN_SHAPES: ReadonlyArray<[RegExp, string]> = [
	[/\b([a-z][a-z0-9+.-]*:\/\/)[^\s@]+@/gi, "$1[redacted]@"],
	[/\b(Bearer|Basic)\s+[\w.~+/=-]{8,}/gi, "$1 [redacted]"],
	[/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,})/g, "[redacted]"],
	[/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g, "[redacted]"],
	[/\bsk-[\w-]{16,}/g, "[redacted]"],
];

/**
 * A scrub for one set of secret values: null when a text holds any of them
 * raw, JSON-escaped or URL-encoded, else the text with token shapes redacted.
 */
export function createBoxLogScrub(
	secrets: readonly string[],
): (text: string) => string | null {
	const forms = secrets
		.filter((secret) => secret.length >= MIN_SECRET_LENGTH)
		.flatMap((secret) => [
			secret,
			JSON.stringify(secret).slice(1, -1),
			encodeURIComponent(secret),
		]);
	return (text) => {
		if (forms.some((form) => text.includes(form))) return null;
		return TOKEN_SHAPES.reduce(
			(scrubbed, [shape, replacement]) => scrubbed.replace(shape, replacement),
			text,
		);
	};
}
