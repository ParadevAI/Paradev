import { createHash } from "node:crypto";
import { findOrgMembership } from "@superset/db/utils";
import { connectionAccessToken } from "../../../../lib/connectors";
import {
	AmbiguousConnectionError,
	orgConnection,
} from "../../../../lib/connectors/lookup";
import { type CardContext, CardUnavailable } from "../types";

const CONNECT = { label: "Connect Stripe", href: "#/settings/integrations" };
const API = "https://api.stripe.com/v1";
const TIMEOUT_MS = 20_000;
const API_VERSION = "2025-12-15.clover";
/** Stripe computes a preview from a POST body and stores nothing. */
const READS_BY_POST = /^invoices\/create_preview$/;

export const LIVE_WRITES_OFF =
	"This Stripe key is live. Writes are off outside production; connect a test key";
const ADMINS_ONLY =
	"Only an owner or admin of this organization can use Stripe";
const NO_ANSWER =
	"Stripe did not answer. Read the card again before you try again";

type Params = Record<string, unknown>;

export interface StripeApi {
	live: boolean;
	account: { id: string; name: string | null };
	writesOff: string | null;
	get: <T>(path: string, query?: Params) => Promise<T>;
	post: <T>(path: string, body?: Params, key?: string) => Promise<T>;
	del: <T>(path: string, body?: Params, key?: string) => Promise<T>;
	url: (path: string) => string;
}

export function isTestKey(key: string): boolean {
	return /^(sk|rk)_test_/.test(key);
}

/** A preview deployment has NODE_ENV=production and a copy of production's connections, so only Vercel's own production marker lets a live key write. */
export function writesOff(
	key: string,
	vercelEnv: string | undefined,
): string | null {
	return isTestKey(key) || vercelEnv === "production" ? null : LIVE_WRITES_OFF;
}

function encode(value: unknown, name: string, out: string[]): void {
	if (value === undefined) return;
	if (Array.isArray(value)) {
		for (const [index, item] of value.entries())
			encode(item, `${name}[${index}]`, out);
		return;
	}
	if (value !== null && typeof value === "object") {
		for (const [key, inner] of Object.entries(value))
			encode(inner, name ? `${name}[${key}]` : key, out);
		return;
	}
	out.push(
		`${encodeURIComponent(name)}=${encodeURIComponent(value === null ? "" : String(value))}`,
	);
}

export function formEncode(params: Params | undefined): string {
	const out: string[] = [];
	if (params) encode(params, "", out);
	return out.join("&");
}

interface StripeFailure {
	error?: {
		type?: string;
		code?: string;
		message?: string;
		decline_code?: string;
	};
}

export function stripeFailure(
	status: number,
	body: StripeFailure,
): CardUnavailable {
	const error = body.error ?? {};
	if (status === 401)
		return new CardUnavailable(
			"no_connector",
			"Stripe no longer accepts this key. Connect Stripe again",
			CONNECT,
		);
	if (status === 403 || error.code === "permission_error")
		return new CardUnavailable(
			"no_access",
			error.message ??
				"This Stripe key does not have permission for that. Add it to the restricted key",
		);
	if (status === 404 || error.code === "resource_missing")
		return new CardUnavailable("gone", "Stripe no longer has that");
	if (status === 429)
		return new CardUnavailable(
			"error",
			"Stripe is limiting requests. Try again in a minute",
		);
	return new CardUnavailable(
		"error",
		error.message ?? "Stripe could not do that. Try again",
	);
}

export function idempotencyKey(ctx: CardContext, parts: unknown[]): string {
	return createHash("sha256")
		.update(JSON.stringify([ctx.card?.id ?? ctx.readerId, ...parts]))
		.digest("hex");
}

export function stripeApi(
	key: string,
	account: StripeApi["account"],
	vercelEnv: string | undefined = process.env.VERCEL_ENV,
	send: typeof fetch = fetch,
): StripeApi {
	const live = !isTestKey(key);
	const off = writesOff(key, vercelEnv);
	const request = async <T>(
		method: "GET" | "POST" | "DELETE",
		path: string,
		params?: Params,
		idempotency?: string,
	): Promise<T> => {
		if (method !== "GET" && off && !READS_BY_POST.test(path))
			throw new CardUnavailable("error", off);
		const encoded = formEncode(params);
		const response = await send(
			`${API}/${path}${method === "GET" && encoded ? `?${encoded}` : ""}`,
			{
				method,
				headers: {
					Authorization: `Bearer ${key}`,
					"Content-Type": "application/x-www-form-urlencoded",
					"Stripe-Version": API_VERSION,
					...(idempotency ? { "Idempotency-Key": idempotency } : {}),
				},
				body: method === "GET" ? undefined : encoded,
				signal: AbortSignal.timeout(TIMEOUT_MS),
			},
		).catch(() => {
			throw new CardUnavailable("error", NO_ANSWER);
		});
		const body = (await response.json().catch(() => ({}))) as T & StripeFailure;
		if (!response.ok) throw stripeFailure(response.status, body);
		return body;
	};
	return {
		live,
		account,
		writesOff: off,
		get: (path, query) => request("GET", path, query),
		post: (path, body, idempotency) => request("POST", path, body, idempotency),
		del: (path, body, idempotency) =>
			request("DELETE", path, body, idempotency),
		url: (path) =>
			`https://dashboard.stripe.com/${account.id}/${live ? "" : "test/"}${path}`,
	};
}

/** The organization's Stripe account; money has no per-person connection, so only its owners and admins reach it. */
export async function stripeFor(ctx: CardContext): Promise<StripeApi> {
	const membership = await findOrgMembership({
		userId: ctx.readerId,
		organizationId: ctx.organizationId,
	});
	if (membership?.role !== "owner" && membership?.role !== "admin")
		throw new CardUnavailable("no_access", ADMINS_ONLY);
	let connection: Awaited<ReturnType<typeof orgConnection>>;
	try {
		connection = await orgConnection(ctx.organizationId, "stripe_api");
	} catch (error) {
		if (error instanceof AmbiguousConnectionError)
			throw new CardUnavailable("error", error.message);
		throw error;
	}
	if (!connection)
		throw new CardUnavailable(
			"no_connector",
			"Connect Stripe for this organization to see this",
			CONNECT,
		);
	return stripeApi(await connectionAccessToken(connection), {
		id: connection.externalAccountId,
		name: connection.externalAccountLabel,
	});
}
