/** A line holding this many characters of any form of a value, in a row, is withheld. */
const SECRET_WINDOW = 12;
/** Shorter values are found only after their key (`KEY=`, `"KEY":`); alone they are words and numbers. */
const MIN_EXACT_LENGTH = 8;

const REDACTED = "[redacted]";

const TOKEN_SHAPES: ReadonlyArray<[RegExp, string]> = [
	[/\b([a-z][a-z0-9+.-]*:\/\/)[^\s@]+@/gi, `$1${REDACTED}@`],
	[/https:\/\/hooks\.slack\.com\/[^\s"'`]+/g, REDACTED],
	[/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, REDACTED],
	[/\bglpat-[A-Za-z0-9_-]{20,}/g, REDACTED],
	[/\bnpm_[A-Za-z0-9]{36}\b/g, REDACTED],
	[/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}/g, REDACTED],
	[/\bwhsec_[A-Za-z0-9]{16,}/g, REDACTED],
	[/\bsk-[A-Za-z0-9_-]{16,}/g, REDACTED],
	[/\bAIza[0-9A-Za-z_-]{30,}/g, REDACTED],
	[/\bya29\.[0-9A-Za-z_-]{20,}/g, REDACTED],
	[/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, REDACTED],
	[/\bxox[abeprs]-[A-Za-z0-9-]{10,}/g, REDACTED],
	[/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, REDACTED],
	[/\b(Bearer|Basic|token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${REDACTED}`],
	[
		/\b(password|passwd|pwd|secret|x-api-key|api-key|apikey|authorization)(\\*["']?\s*[:=]\s*)(\\*"(?:[^"\\]|\\.)*?\\*"|'[^']*'|[^\s,;}&]+)/gi,
		`$1$2${REDACTED}`,
	],
	[
		/\b([A-Za-z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_KEY)[A-Za-z0-9_]*)(\\*["']?\s*[:=]\s*)(\\*"(?:[^"\\]|\\.)*?\\*"|'[^']*'|[^\s,;}&]+)/gi,
		`$1$2${REDACTED}`,
	],
];

const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;

function aws40(text: string): string {
	return text.replace(
		/(?<![A-Za-z0-9/+])[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+=])/g,
		(match) =>
			/[A-Z]/.test(match) && /[a-z]/.test(match) && /[0-9/+]/.test(match)
				? REDACTED
				: match,
	);
}

function base64Forms(value: string): string[] {
	const forms: string[] = [];
	const bytes = Buffer.from(value);
	for (const shift of [0, 1, 2]) {
		const encoded = Buffer.concat([Buffer.alloc(shift), bytes]).toString(
			"base64",
		);
		const stable = encoded.slice(shift === 0 ? 0 : 4, -4);
		forms.push(stable, stable.replace(/\+/g, "-").replace(/\//g, "_"));
	}
	return forms;
}

function urlPassword(value: string): string[] {
	try {
		const { password } = new URL(value);
		return password ? [password, decodeURIComponent(password)] : [];
	} catch {
		return [];
	}
}

/** Every way a value can be written into a line. */
function forms(value: string): string[] {
	const parts = [value, ...value.split(/\r?\n/), ...urlPassword(value)].filter(
		(part) => part.length >= MIN_EXACT_LENGTH,
	);
	return parts.flatMap((part) => {
		const json = JSON.stringify(part).slice(1, -1);
		return [
			part,
			json,
			JSON.stringify(json).slice(1, -1),
			encodeURIComponent(part),
			encodeURIComponent(part).replace(/%20/g, "+"),
			Buffer.from(part).toString("hex"),
			Buffer.from(part).toString("hex").toUpperCase(),
			...base64Forms(part),
		];
	});
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A scrub for one set of managed values, keyed by their names. It returns a
 * line with every value that follows one of the names and every token shape
 * replaced, or null when the line still holds `SECRET_WINDOW` characters of
 * any form of any value, or a private key: such a line must not leave the box.
 */
export function createBoxLogScrub(
	values: Readonly<Record<string, string>>,
): (line: string) => string | null {
	const windows = new Set<string>();
	const exact = new Set<string>();
	for (const value of Object.values(values)) {
		if (value.length < MIN_EXACT_LENGTH) continue;
		for (const form of forms(value)) {
			if (form.length < MIN_EXACT_LENGTH) continue;
			if (form.length < SECRET_WINDOW) exact.add(form);
			for (let at = 0; at + SECRET_WINDOW <= form.length; at++) {
				windows.add(form.slice(at, at + SECRET_WINDOW));
			}
		}
	}
	const keys = Object.keys(values).filter(Boolean).map(escapeRegExp);
	const afterKey = keys.length
		? new RegExp(
				`(\\b(?:${keys.join("|")})\\\\*["']?\\s*[:=]\\s*)(\\\\*"(?:[^"\\\\]|\\\\.)*?\\\\*"|'[^']*'|[^\\s,;}&]*)`,
				"g",
			)
		: null;

	return (line) => {
		if (PRIVATE_KEY.test(line)) return null;
		let scrubbed = afterKey ? line.replace(afterKey, `$1${REDACTED}`) : line;
		for (const [shape, replacement] of TOKEN_SHAPES) {
			scrubbed = scrubbed.replace(shape, replacement);
		}
		scrubbed = aws40(scrubbed);
		for (let at = 0; at + SECRET_WINDOW <= scrubbed.length; at++) {
			if (windows.has(scrubbed.slice(at, at + SECRET_WINDOW))) return null;
		}
		for (const form of exact) if (scrubbed.includes(form)) return null;
		return scrubbed;
	};
}
