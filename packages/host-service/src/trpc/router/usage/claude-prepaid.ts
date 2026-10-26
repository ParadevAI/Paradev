import { createHash } from "node:crypto";
import {
	claudeRequests,
	type createClaudeRequestClient,
} from "./claude-request";
import { createCredentialQuotaCache } from "./credential-quota-cache";
import { recordQuotaRetry } from "./quota-backoff";
import { claudeProfileIdentity } from "./quota-identity";
import type { UsageAccount } from "./types";

const supportedCurrencies = new Set(Intl.supportedValuesOf("currency"));

function record(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

export function parseClaudePrepaidBalance(
	value: unknown,
	checkedAt = new Date(),
): UsageAccount["prepaidBalance"] {
	const root = record(value);
	if (!root) return undefined;
	const balance = record(root.balance);
	const money = record(balance?.money);
	const credits = record(balance?.credits);
	if (
		(root.balance != null && !balance) ||
		(balance?.money != null && !money) ||
		(balance?.credits != null && !credits)
	)
		return undefined;
	const amount = root.amount ?? money?.amount_minor ?? credits?.amount_minor;
	if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0)
		return undefined;
	const currencies = [money?.currency, root.currency]
		.filter((currency) => currency != null)
		.map((currency) =>
			typeof currency === "string" ? currency.trim().toUpperCase() : "",
		);
	const currency = currencies[0] ?? null;
	if (
		(currency === null ? amount !== 0 : !supportedCurrencies.has(currency)) ||
		currencies.some((value) => value !== currency)
	)
		return undefined;
	const currencyExponent = currency
		? new Intl.NumberFormat(undefined, {
				style: "currency",
				currency,
			}).resolvedOptions().maximumFractionDigits
		: null;
	// The legacy response omits its exponent for two-decimal currencies.
	const exponent =
		money?.exponent ??
		credits?.exponent ??
		(currencyExponent === 2 || amount === 0 ? 2 : undefined);
	if (
		typeof exponent !== "number" ||
		!Number.isInteger(exponent) ||
		exponent < 0 ||
		exponent > 6 ||
		![root.amount, money?.amount_minor, credits?.amount_minor]
			.filter((value) => value != null)
			.every((value) => value === amount) ||
		!Number.isFinite(checkedAt.getTime())
	)
		return undefined;
	return { amount: amount / 10 ** exponent, currency, checkedAt };
}

function walletKey(
	accessToken: string,
	identity: NonNullable<ReturnType<typeof claudeProfileIdentity>>,
) {
	return createHash("sha256")
		.update(
			JSON.stringify([accessToken, identity.principal, identity.organization]),
		)
		.digest("hex");
}

export function createClaudePrepaidReader({
	request = claudeRequests.request,
	now = () => Date.now(),
}: {
	request?: ReturnType<typeof createClaudeRequestClient>["request"];
	now?: () => number;
} = {}) {
	const wallets = createCredentialQuotaCache<{
		balance?: UsageAccount["prepaidBalance"];
	}>(30 * 60_000, now);
	function peek(accessToken: string, profile: unknown) {
		const identity = claudeProfileIdentity(profile);
		if (!identity || !accessToken.trim()) return undefined;
		const balance = wallets.peek(walletKey(accessToken, identity))?.value
			.balance;
		const measuredAt = balance?.checkedAt.getTime();
		return balance &&
			measuredAt !== undefined &&
			Number.isFinite(measuredAt) &&
			measuredAt <= now() &&
			now() - measuredAt <= 31 * 60_000
			? { ...balance, checkedAt: new Date(balance.checkedAt) }
			: undefined;
	}
	return {
		peek,
		async fetch(
			accessToken: string,
			profile: unknown,
			signal: AbortSignal,
			canonicalProfile?: string | null,
		) {
			const identity = claudeProfileIdentity(profile);
			if (!identity || !accessToken.trim() || signal.aborted) return undefined;
			try {
				const key = walletKey(accessToken, identity);
				await wallets.get(
					key,
					async () => {
						const previous = peek(accessToken, profile);
						const response = await request(
							"wallet",
							accessToken,
							`https://api.anthropic.com/api/oauth/organizations/${identity.organization}/prepaid/credits`,
							{
								method: "GET",
								cache: "no-store",
								redirect: "error",
								headers: {
									Authorization: `Bearer ${accessToken}`,
									"anthropic-beta": "oauth-2025-04-20",
								},
								signal,
							},
							canonicalProfile,
						);
						if (response.ok && signal.aborted)
							return recordQuotaRetry(
								{ balance: previous },
								new Response(null, { status: 503 }),
							);
						if (!response.ok)
							return recordQuotaRetry(
								{
									balance: [408, 429, 500, 502, 503, 504, 529].includes(
										response.status,
									)
										? previous
										: undefined,
								},
								response,
							);
						const body: unknown = await response.json();
						if (signal.aborted)
							return recordQuotaRetry(
								{ balance: previous },
								new Response(null, { status: 503 }),
							);
						return {
							balance: parseClaudePrepaidBalance(body, new Date(now())),
						};
					},
					false,
				);
				return peek(accessToken, profile);
			} catch {
				return peek(accessToken, profile);
			}
		},
	};
}

const prepaidReader = createClaudePrepaidReader();
export const fetchClaudePrepaidBalance = prepaidReader.fetch;
export const peekClaudePrepaidBalance = prepaidReader.peek;
