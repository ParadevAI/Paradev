/** Shorter values are ordinary words and numbers (`PORT=3000`, `true`), not secrets. */
export const MIN_SECRET_LENGTH = 8;

const REDACTED = "[redacted]";

const TOKEN_SHAPES: ReadonlyArray<[RegExp, string]> = [
	[/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, REDACTED],
	[/\bsk-[A-Za-z0-9_-]{16,}/g, REDACTED],
	[/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, REDACTED],
	[/\bxox[abeprs]-[A-Za-z0-9-]{10,}/g, REDACTED],
	[/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, REDACTED],
	[/\b(Bearer|Basic|token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${REDACTED}`],
	[/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, `$1${REDACTED}@`],
	[
		/\b([A-Za-z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_KEY)[A-Za-z0-9_]*)=("[^"]*"|'[^']*'|\S+)/gi,
		`$1=${REDACTED}`,
	],
	[
		/("[^"]*(?:secret|token|password|passwd|api_?key)[^"]*"\s*:\s*)"(?:[^"\\]|\\.)*"/gi,
		`$1"${REDACTED}"`,
	],
];

const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;

/** Every way a value can be written into a line: raw, JSON-escaped, URL-encoded, and each of its own lines. */
function secretForms(secrets: readonly string[]): string[] {
	const forms = new Set<string>();
	for (const secret of secrets) {
		for (const part of [secret, ...secret.split(/\r?\n/)]) {
			for (const form of [
				part,
				JSON.stringify(part).slice(1, -1),
				encodeURIComponent(part),
			]) {
				if (form.length >= MIN_SECRET_LENGTH) forms.add(form);
			}
		}
	}
	return [...forms].sort((a, b) => b.length - a.length);
}

/** A line that starts with the end of a secret, ends with its start, or is all middle holds a value cut by a line break. */
function holdsCutSecret(line: string, forms: readonly string[]): boolean {
	if (line.length < MIN_SECRET_LENGTH) return false;
	const head = line.slice(0, MIN_SECRET_LENGTH);
	for (const form of forms) {
		if (form.includes(line)) return true;
		const start = form.slice(0, MIN_SECRET_LENGTH);
		for (
			let at = line.indexOf(start, line.length - form.length + 1);
			at !== -1;
			at = line.indexOf(start, at + 1)
		) {
			if (form.startsWith(line.slice(at))) return true;
		}
		for (
			let at = form.indexOf(head, 1);
			at !== -1;
			at = form.indexOf(head, at + 1)
		) {
			if (line.startsWith(form.slice(at))) return true;
		}
	}
	return false;
}

/**
 * The text of one box log line with every given secret and every token shape
 * removed, or null when it cannot be made safe and must not leave the box.
 */
export function scrubBoxLogLine(
	line: string,
	secrets: readonly string[],
): string | null {
	if (PRIVATE_KEY.test(line)) return null;
	const forms = secretForms(secrets);
	let scrubbed = line;
	for (const form of forms) scrubbed = scrubbed.split(form).join(REDACTED);
	for (const [shape, replacement] of TOKEN_SHAPES) {
		scrubbed = scrubbed.replace(shape, replacement);
	}
	for (const part of scrubbed.split(/\r?\n/)) {
		if (holdsCutSecret(part.trim(), forms)) return null;
	}
	return scrubbed;
}
