import type { z } from "zod";

/**
 * A list cursor is opaque to every caller, so the keyset and the sort it
 * belongs to can change without breaking a client that echoes it back.
 */
export function encodeCursor(keyset: object): string {
	return Buffer.from(JSON.stringify(keyset)).toString("base64url");
}

/** Null when the value does not decode to the schema. */
export function decodeCursor<T>(value: string, schema: z.ZodType<T>): T | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
	} catch {
		return null;
	}
	const result = schema.safeParse(parsed);
	return result.success ? result.data : null;
}
