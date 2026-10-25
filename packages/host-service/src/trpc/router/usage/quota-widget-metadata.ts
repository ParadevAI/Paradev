import { createHash } from "node:crypto";
import {
	parseClaudeResetCredits,
	parseCodexResetCredits,
} from "./reset-credits";
import type { UsageResetCredits } from "./types";

const TTL = 5 * 60_000;
const MAX_SCOPES = 5_000;
export type QuotaFetch = (
	...args: Parameters<typeof globalThis.fetch>
) => ReturnType<typeof globalThis.fetch>;
export function opaqueQuotaIdentity(
	provider: string,
	source: string,
	owner: string,
) {
	return createHash("sha256")
		.update(JSON.stringify([provider, source, owner]))
		.digest("hex");
}

export function createResetMetadataReader(
	fetcher: QuotaFetch = globalThis.fetch,
	now = Date.now,
	deadline = (milliseconds: number) => AbortSignal.timeout(milliseconds),
) {
	const rateLimits = createQuotaRateLimitGate(now);
	const entries = new Map<
		string,
		{ at: number; promise: Promise<UsageResetCredits | undefined> }
	>();
	const read = (
		key: string,
		load: () => Promise<UsageResetCredits | undefined>,
	) => {
		const saved = entries.get(key);
		if (saved && now() - saved.at < TTL) return saved.promise;
		if (entries.size >= MAX_SCOPES)
			for (const [scope, entry] of entries)
				if (now() - entry.at >= TTL) entries.delete(scope);
		if (!entries.has(key) && entries.size >= MAX_SCOPES)
			return Promise.resolve(undefined);
		const entry = {
			at: now(),
			promise: Promise.resolve()
				.then(load)
				.catch(() => undefined),
		};
		entries.delete(key);
		entries.set(key, entry);
		return entry.promise;
	};
	return {
		codex(accessToken: string, accountId: string, parentSignal?: AbortSignal) {
			const key = opaqueQuotaIdentity("codex", accessToken, accountId);
			if (rateLimits.blocked(key)) return Promise.resolve(undefined);
			return read(key, async () => {
				const response = await fetcher(
					"https://chatgpt.com/backend-api/wham/rate-limit-reset-credits",
					{
						method: "GET",
						cache: "no-store",
						headers: {
							Authorization: `Bearer ${accessToken}`,
							"ChatGPT-Account-ID": accountId,
							"OpenAI-Beta": "codex-1",
							originator: "Codex Desktop",
							Accept: "application/json",
						},
						signal: parentSignal
							? AbortSignal.any([deadline(2_000), parentSignal])
							: deadline(2_000),
					},
				);
				rateLimits.record(key, response);
				if (!response.ok) return undefined;
				const body: unknown = await response.json();
				return parseCodexResetCredits(body, body, new Date(now()));
			});
		},
		async claude(accessToken: string) {
			const key = opaqueQuotaIdentity("claude", accessToken, "reset-inventory");
			if (rateLimits.blocked(key))
				return { status: 429, body: null, resetCredits: undefined };
			let captured: { status: number; body: unknown } | undefined;
			let failure: unknown;
			const saved = entries.get(key);
			const requestInventory = !saved || now() - saved.at >= TTL;
			const signal = deadline(8_000);
			const request = async (inventory: boolean) => {
				const response = await fetcher(
					`https://api.anthropic.com/api/oauth/usage${inventory ? "?cedar_ember=1" : ""}`,
					{
						method: "GET",
						cache: "no-store",
						headers: {
							Authorization: `Bearer ${accessToken}`,
							"anthropic-beta": "oauth-2025-04-20",
						},
						signal,
					},
				);
				rateLimits.record(key, response);
				return {
					status: response.status,
					body: response.ok ? ((await response.json()) as unknown) : null,
				};
			};
			if (!requestInventory) captured = await request(false);
			else {
				await read(key, async () => {
					try {
						captured = await request(true);
						if (captured.status === 400 || captured.status === 403)
							captured = await request(false);
					} catch (error) {
						failure = error;
						throw error;
					}
					if (
						captured.status !== 200 ||
						!captured.body ||
						typeof captured.body !== "object"
					)
						return undefined;
					return parseClaudeResetCredits(
						(captured.body as { cedar_ember?: unknown }).cedar_ember,
						new Date(now()),
					);
				});
				if (failure) throw failure;
				// Another caller can own the inventory request; quota still needs its own response.
				captured ??= await request(false);
			}
			return { ...captured, resetCredits: await entries.get(key)?.promise };
		},
		clear() {
			entries.clear();
			rateLimits.clear();
		},
	};
}

export function createQuotaRateLimitGate(now = Date.now) {
	const limits = new Map<string, number>();
	let overflowUntil = 0;
	return {
		blocked(key: string) {
			return (limits.get(key) ?? overflowUntil) > now();
		},
		record(key: string, response: Pick<Response, "status" | "headers">) {
			if (response.status !== 429) return;
			const text = response.headers.get("retry-after");
			const seconds = text?.trim() ? Number(text) : Number.NaN;
			const requested =
				Number.isFinite(seconds) && seconds >= 0
					? seconds * 1_000
					: text
						? Date.parse(text) - now()
						: Number.NaN;
			const duration = Number.isFinite(requested)
				? Math.max(TTL, Math.min(24 * 60 * 60_000, requested))
				: TTL;
			if (limits.size >= MAX_SCOPES)
				for (const [scope, until] of limits)
					if (until <= now()) limits.delete(scope);
			if (!limits.has(key) && limits.size >= MAX_SCOPES) {
				overflowUntil = Math.max(overflowUntil, now() + duration);
				return;
			}
			limits.delete(key);
			limits.set(key, now() + duration);
		},
		clear() {
			limits.clear();
			overflowUntil = 0;
		},
	};
}

export const quotaRateLimits = createQuotaRateLimitGate();

export const resetMetadata = createResetMetadataReader();
