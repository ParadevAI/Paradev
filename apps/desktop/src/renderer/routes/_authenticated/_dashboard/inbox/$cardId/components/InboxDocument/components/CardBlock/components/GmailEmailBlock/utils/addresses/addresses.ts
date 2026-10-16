import type { GmailAddress } from "../../types";

const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

/** One typed or pasted recipient: `a@b.co`, `Name <a@b.co>` or `"Last, First" <a@b.co>`. */
export function parseRecipient(raw: string): GmailAddress | null {
	const value = raw.trim();
	const angle = value.match(/^(.*?)<([^<>]+)>$/);
	if (angle) {
		const email = (angle[2] ?? "").trim();
		const name = (angle[1] ?? "").trim().replace(/^"(.*)"$/, "$1");
		return EMAIL.test(email) ? { name: name || null, email } : null;
	}
	return EMAIL.test(value) ? { name: null, email: value } : null;
}

/** Pasted text split into recipients on commas, semicolons and newlines outside quotes and brackets. */
export function splitRecipients(text: string): string[] {
	const out: string[] = [];
	let current = "";
	let quoted = false;
	let angle = 0;
	for (const char of text) {
		if (char === '"') quoted = !quoted;
		else if (!quoted && char === "<") angle++;
		else if (!quoted && char === ">") angle = Math.max(0, angle - 1);
		if (!quoted && angle === 0 && /[,;\n]/.test(char)) {
			if (current.trim()) out.push(current.trim());
			current = "";
			continue;
		}
		current += char;
	}
	if (current.trim()) out.push(current.trim());
	return out;
}

export function formatRecipient(address: GmailAddress): string {
	if (!address.name) return address.email;
	const name = /[",;<>@()[\]:\\]/.test(address.name)
		? `"${address.name.replace(/(["\\])/g, "\\$1")}"`
		: address.name;
	return `${name} <${address.email}>`;
}

export function displayName(address: GmailAddress): string {
	return address.name ?? address.email;
}

/** The name the thread gives this address, or the address itself: a name the agent wrote could pose as anyone. */
export function chipLabel(
	address: GmailAddress,
	known: ReadonlyMap<string, GmailAddress>,
): string {
	const vouched = known.get(address.email.toLowerCase());
	return vouched ? displayName(vouched) : address.email;
}

export function byEmail(
	addresses: GmailAddress[],
): ReadonlyMap<string, GmailAddress> {
	return new Map(addresses.map((a) => [a.email.toLowerCase(), a]));
}

export interface MailtoFields {
	to: GmailAddress[];
	cc: GmailAddress[];
	bcc: GmailAddress[];
	subject: string;
	body: string;
}

function decodeMailto(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

/** A `mailto:` link as Gmail reads it: recipients from the path and `to`/`cc`/`bcc`, plus `subject` and `body`. A `+` stays a plus. */
export function parseMailto(href: string): MailtoFields | null {
	if (!/^mailto:/i.test(href)) return null;
	const [path = "", query = ""] = href.slice(7).split("?");
	const params = new Map<string, string[]>();
	for (const pair of query.split("&")) {
		const [key = "", value = ""] = pair.split("=");
		if (!key) continue;
		const name = decodeMailto(key).toLowerCase();
		params.set(name, [...(params.get(name) ?? []), decodeMailto(value)]);
	}
	const list = (...values: string[]) =>
		values
			.flatMap((value) => splitRecipients(value))
			.flatMap((raw) => {
				const address = parseRecipient(raw);
				return address ? [address] : [];
			});
	return {
		to: list(decodeMailto(path), ...(params.get("to") ?? [])),
		cc: list(...(params.get("cc") ?? [])),
		bcc: list(...(params.get("bcc") ?? [])),
		subject: params.get("subject")?.[0] ?? "",
		body: params.get("body")?.[0] ?? "",
	};
}
