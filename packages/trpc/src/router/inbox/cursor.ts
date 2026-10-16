const POSTGRES_TIMESTAMPTZ_TEXT =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

/** Where a page ended: the ordering timestamp of its last card, then its id. */
export interface InboxListKeyset {
	at: string;
	id: string;
}

export function encodeInboxCursor(keyset: InboxListKeyset): string {
	return Buffer.from(JSON.stringify(keyset)).toString("base64url");
}

export function decodeInboxCursor(value: string): InboxListKeyset | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
	} catch {
		return null;
	}
	const keyset = parsed as Partial<InboxListKeyset> | null;
	if (typeof keyset?.at !== "string" || typeof keyset.id !== "string") {
		return null;
	}
	// `at` is interpolated into the query as `::timestamptz`, so it is checked
	// here rather than trusted from whatever the caller echoed back.
	if (!POSTGRES_TIMESTAMPTZ_TEXT.test(keyset.at)) return null;
	return { at: keyset.at, id: keyset.id };
}
