import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const EXPIRY_STEP_S = 60 * 60;

/**
 * Short-lived signed tokens for a file behind an integration's auth. An
 * `<img>` or a download link cannot carry a token, so a card hands the
 * client a URL naming the file, and the API fetches it with the
 * integration's credentials. The token names the file, never its address.
 */
export interface FileTickets<T> {
	sign: (fields: T) => string;
	read: (token: string) => T | null;
}

/** Rounded up to the hour so a file keeps one URL between reads and the browser cache holds. */
function expiryFrom(nowMs: number, ttlSeconds: number): number {
	return Math.ceil((nowMs / 1000 + ttlSeconds) / EXPIRY_STEP_S) * EXPIRY_STEP_S;
}

export function fileTickets<T extends Record<string, unknown>>(
	{
		secret,
		purpose,
		schema,
		ttlSeconds,
	}: {
		secret: string;
		/** Keeps a ticket for one kind of file from opening another. */
		purpose: string;
		schema: z.ZodType<T>;
		ttlSeconds: number;
	},
	now: () => number = Date.now,
): FileTickets<T> {
	const key = createHmac("sha256", secret).update(purpose).digest();
	const sign = (payload: string) =>
		createHmac("sha256", key).update(payload).digest("base64url");
	const withExpiry = z.object({ e: z.number() }).passthrough();
	return {
		sign(fields) {
			const payload = Buffer.from(
				JSON.stringify({ ...fields, e: expiryFrom(now(), ttlSeconds) }),
			).toString("base64url");
			return `${payload}.${sign(payload)}`;
		},
		read(token) {
			const [payload, signature] = token.split(".");
			if (!payload || !signature) return null;
			const expected = Buffer.from(sign(payload));
			const given = Buffer.from(signature);
			if (
				expected.length !== given.length ||
				!timingSafeEqual(expected, given)
			) {
				return null;
			}
			let decoded: unknown;
			try {
				decoded = JSON.parse(
					Buffer.from(payload, "base64url").toString("utf8"),
				);
			} catch {
				return null;
			}
			const dated = withExpiry.safeParse(decoded);
			if (!dated.success || dated.data.e * 1000 < now()) return null;
			const fields = schema.safeParse(decoded);
			return fields.success ? fields.data : null;
		},
	};
}
