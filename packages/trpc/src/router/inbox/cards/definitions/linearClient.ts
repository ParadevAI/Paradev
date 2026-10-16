import { callLinear } from "../../../integration/linear/refresh";
import { TokenRefreshError } from "../../../integration/token-refresh";
import { type CardContext, CardUnavailable } from "../types";

const CONNECT = { label: "Connect Linear", href: "#/settings/integrations" };

/** Runs one GraphQL document as the reader. */
export type LinearQuery = <T>(
	document: string,
	variables?: Record<string, unknown>,
) => Promise<T>;

/** What the SDK throws: its own error type, the message Linear wrote, and each GraphQL error under it. */
interface LinearFailure {
	type?: string;
	message?: string;
	errors?: { type?: string; message?: string; userError?: boolean }[];
}

const RATE_LIMITED = "Linear is limiting requests. Try again in a minute";

/** Linear's reason for refusing a request, as the card state that explains it. */
export function linearFailure(error: unknown): CardUnavailable | null {
	if (error instanceof CardUnavailable) return error;
	const failure = error as LinearFailure;
	const first = failure.errors?.[0];
	const type = `${failure.type ?? ""} ${first?.type ?? ""}`;
	const message = first?.message ?? failure.message ?? "";
	if (/ratelimit/i.test(type))
		return new CardUnavailable("error", RATE_LIMITED);
	if (/forbidden/i.test(type))
		return new CardUnavailable(
			"no_access",
			"Your Linear account cannot do that here",
		);
	if (/not found|could not find/i.test(message))
		return new CardUnavailable("gone", "That is no longer in Linear");
	return first?.userError && first.message
		? new CardUnavailable("error", first.message)
		: null;
}

/** The reader's own Linear connection, or the degraded state that explains its absence. */
export function linearFor(ctx: CardContext): LinearQuery {
	return async <T>(document: string, variables?: Record<string, unknown>) => {
		let result: T | null;
		try {
			result = await callLinear(
				ctx.organizationId,
				ctx.readerId,
				async (client) =>
					(
						await client.client.rawRequest<T, Record<string, unknown>>(
							document,
							variables,
						)
					).data as T,
			);
		} catch (error) {
			if (error instanceof TokenRefreshError)
				throw new CardUnavailable(
					"no_connector",
					"Linear needs reconnecting",
					CONNECT,
				);
			throw linearFailure(error) ?? error;
		}
		if (result === null)
			throw new CardUnavailable(
				"no_connector",
				"Connect Linear to see this",
				CONNECT,
			);
		return result;
	};
}
