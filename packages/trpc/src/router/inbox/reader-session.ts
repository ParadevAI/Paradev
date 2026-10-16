import { userError } from "../../i18n-error";
import type { TRPCContext } from "../../trpc";

type Caller = Pick<TRPCContext, "headers" | "agentCaller" | "sandboxCaller">;

function bearer(headers: Headers): string | null {
	return headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}

/**
 * True when a person is signed in to an app: a session cookie, or the app's
 * own session token. An agent in a terminal holds what the CLI holds, an
 * OAuth access token (a JWT) or an API key; MCP and a cloud workspace have
 * their own transports. None of those is the reader's session.
 */
export function isReaderSession(ctx: Caller): boolean {
	if (ctx.agentCaller || ctx.sandboxCaller) return false;
	if (ctx.headers.get("x-api-key")) return false;
	const token = bearer(ctx.headers);
	if (!token) return true;
	const isJwt = token.split(".").filter(Boolean).length === 3;
	return !isJwt && !token.startsWith("sk_");
}

/** Answering a card is the reader's own act: the session that wrote the card must not be able to approve it. */
export function assertReaderSession(ctx: Caller): void {
	if (isReaderSession(ctx)) return;
	throw userError({
		code: "FORBIDDEN",
		message:
			"A card is answered by the person it was sent to, in the Superset app. An agent or the CLI cannot answer it.",
		i18nKey: "serverError.inbox.readerSessionRequired",
	});
}
