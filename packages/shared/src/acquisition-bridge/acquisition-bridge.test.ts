import { describe, expect, test } from "bun:test";
import { collectTouchSnapshot, sanitizeTouchSnapshot } from "./browser";
import {
	AcquisitionBridge,
	type AcquisitionKV,
	BRIDGE_COOKIES,
	BRIDGE_TTL,
	hasExactOrigin,
	LINEAGE_CAS_SCRIPT,
	readBridgeCookie,
	validateReturnTo,
} from "./server";

class MemoryKV implements AcquisitionKV {
	data = new Map<
		string,
		{
			value: unknown;
			expiresAt: number;
		}
	>();
	constructor(private now: () => number) {}
	async get<T>(key: string): Promise<T | null> {
		const entry = this.data.get(key);
		return entry && entry.expiresAt > this.now()
			? (structuredClone(entry.value) as T)
			: null;
	}
	async getdel<T>(key: string): Promise<T | null> {
		const entry = this.data.get(key);
		this.data.delete(key);
		return entry && entry.expiresAt > this.now()
			? (structuredClone(entry.value) as T)
			: null;
	}
	async set(
		key: string,
		value: unknown,
		options?: {
			ex?: number;
			nx?: boolean;
		},
	) {
		const existing = this.data.get(key);
		if (options?.nx && existing && existing.expiresAt > this.now()) return null;
		this.data.set(key, {
			value: structuredClone(value),
			expiresAt: options?.ex ? this.now() + options.ex * 1000 : Infinity,
		});
		return "OK";
	}
	async eval(script: string, keys: string[], args: (string | number)[]) {
		expect(script).toBe(LINEAGE_CAS_SCRIPT);
		const entry = this.data.get(required(keys[0]));
		if (
			!entry ||
			entry.expiresAt <= this.now() ||
			(
				entry.value as {
					revision: number;
				}
			).revision !== args[0]
		)
			return 0;
		this.data.set(required(keys[0]), {
			value: JSON.parse(args[1] as string),
			expiresAt: this.now() + Number(args[2]) * 1000,
		});
		return 1;
	}
}
function setup() {
	let now = Date.parse("2026-11-12T00:00:00.000Z");
	const kv = new MemoryKV(() => now);
	const service = new AcquisitionBridge(kv, {
		now: () => now,
		internalOrigins: ["https://preview.example.net"],
	});
	const advance = (seconds: number) => {
		now += seconds * 1000;
	};
	const touch = (query = "") =>
		required(
			collectTouchSnapshot({ href: `https://paradev.com/start${query}` }),
		);
	async function pending(credential: string | null, returnTo = "/sign-up") {
		const { attempt } = await service.begin(returnTo);
		const issued = await service.issue(attempt, credential);
		expect(issued).not.toBeNull();
		return service.receive(required(issued).ticket, attempt);
	}
	return { kv, service, advance, touch, pending };
}
for (const [label, returnTo] of [
	["web", "/sign-up?next=%2Fworkspace&invite=x&invite=y"],
	[
		"desktop",
		"/sign-in?desktop_state=opaque-state&protocol=paradev&local_callback=http%3A%2F%2F127.0.0.1%3A43123%2Fcallback",
	],
	[
		"desktop success",
		"/auth/desktop/success?desktop_state=opaque-state&protocol=paradev",
	],
	["desktop API", "/api/auth/desktop/connect?state=opaque&code=one%2Btwo"],
] as const) {
	test(`tagged marketing → ${label} return preserves every search parameter`, async () => {
		const { service, touch, pending } = setup();
		const minted = required(
			await service.mintLineage(
				"enabled",
				touch("?utm_source=google&utm_medium=cpc&gclid=Safe_123"),
			),
		);
		expect(minted.anonymousId).toMatch(/^acq_[a-f0-9]{32}$/);
		expect(minted.credential).toMatch(/^[a-f0-9]{64}$/);
		expect(minted.setCookie).toContain("HttpOnly; Secure; SameSite=Lax");
		const received = await pending(minted.credential, returnTo);
		expect(received.returnTo).toBe(returnTo);
		const event = required(
			await service.bind(received.pendingToken, "trusted-account"),
		);
		expect(event).toMatchObject({
			event: "$identify",
			distinctId: "trusted-account",
			properties: {
				$anon_distinct_id: minted.anonymousId,
				$set_once: { acquisition_first_utm_source: "google" },
				$set: { acquisition_latest_non_direct_gclid: "Safe_123" },
			},
		});
		expect(event.uuid).toMatch(
			/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
		);
	});
}
test("first touch is immutable; later campaign changes latest; direct and internal visits preserve latest", async () => {
	const { service, touch, advance, pending } = setup();
	const minted = required(
		await service.mintLineage("enabled", touch("?utm_source=first")),
	);
	advance(10);
	await service.updateLineage(
		minted.credential,
		"enabled",
		touch("?utm_source=last"),
	);
	advance(10);
	await service.updateLineage(minted.credential, "enabled", touch());
	await service.updateLineage(
		minted.credential,
		"enabled",
		collectTouchSnapshot({
			href: "https://paradev.com/",
			referrer: "https://app.superset.sh/sign-in?secret=x",
		}),
	);
	const event = required(
		await service.bind((await pending(minted.credential)).pendingToken, "user"),
	);
	expect(event.properties.$set_once).toMatchObject({
		acquisition_first_utm_source: "first",
		acquisition_first_timestamp: "2026-11-12T00:00:00.000Z",
	});
	expect(event.properties.$set).toMatchObject({
		acquisition_latest_non_direct_utm_source: "last",
		acquisition_latest_non_direct_timestamp: "2026-11-12T00:00:10.000Z",
	});
});
test("direct first visit stays first without claiming a marketing source", async () => {
	const { service, touch, pending } = setup();
	const minted = required(await service.mintLineage("enabled", touch()));
	const event = required(
		await service.bind((await pending(minted.credential)).pendingToken, "user"),
	);
	expect(event.properties.$set).toEqual({});
	expect(event.properties.$set_once).toEqual({
		acquisition_first_landing_pathname: "/start",
		acquisition_first_timestamp: "2026-11-12T00:00:00.000Z",
	});
});
test("server ignores forged IDs and client timestamps; only credential updates an existing lineage", async () => {
	const { service, touch, pending } = setup();
	const input = {
		...touch("?utm_source=good"),
		anonymousId: "existing-account",
		id: "acq_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		timestamp: "2099-01-01",
	};
	const first = required(await service.mintLineage("enabled", input));
	const second = required(
		await service.updateLineage(first.anonymousId, "enabled", input),
	);
	expect(second.anonymousId === first.anonymousId).toBe(false);
	const event = required(
		await service.bind((await pending(first.credential)).pendingToken, "user"),
	);
	expect(event.properties.$anon_distinct_id).toBe(required(first.anonymousId));
	expect(event.properties.$set_once.acquisition_first_timestamp).toBe(
		"2026-11-12T00:00:00.000Z",
	);
	expect(JSON.stringify(event)).not.toContain("existing-account");
});
test("disabled/unavailable lineage states collect nothing and markers clear stale pending cookies", async () => {
	const { service, kv, touch, pending } = setup();
	expect(await service.mintLineage("unavailable" as never, touch())).toBeNull();
	expect(
		await service.updateLineage(null, "unavailable" as never, touch()),
	).toBeNull();
	expect(kv.data.size).toBe(0);
	const declined = required(
		await service.mintLineage("disabled", touch("?utm_source=secret")),
	);
	expect(declined.anonymousId).toBeNull();
	for (const [credential, state] of [
		[null, "unavailable"],
		[declined.credential, "disabled"],
	] as const) {
		const result = await pending(credential);
		expect(result.state).toBe(state);
		expect(result.pendingToken).toBeNull();
		expect(result.setCookies).toContain(
			`${BRIDGE_COOKIES.pending}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
		);
	}
	expect(JSON.stringify([...kv.data.values()])).not.toContain("secret");
});
test("opt-out invalidates pending even after tracking is re-enabled", async () => {
	const { service, touch, pending } = setup();
	const minted = required(
		await service.mintLineage("enabled", touch("?utm_source=old")),
	);
	const received = await pending(minted.credential);
	await service.revokeLineage(minted.credential);
	expect(await service.bind(received.pendingToken, "user")).toBeNull();
	const renewed = required(
		await service.updateLineage(
			minted.credential,
			"enabled",
			touch("?utm_source=new"),
		),
	);
	expect(renewed.anonymousId).not.toBe(minted.anonymousId);
	expect(await service.bind(received.pendingToken, "user")).toBeNull();
	const event = required(
		await service.bind((await pending(minted.credential)).pendingToken, "user"),
	);
	expect(event.properties.$set_once.acquisition_first_utm_source).toBe("new");
});
test("revoke and re-enable before bind still invalidates the prior grant", async () => {
	const { service, touch, pending } = setup();
	const minted = required(await service.mintLineage("enabled", touch()));
	const received = await pending(minted.credential);
	await service.revokeLineage(minted.credential);
	await service.updateLineage(minted.credential, "enabled", touch());
	expect(await service.bind(received.pendingToken, "user")).toBeNull();
});
test("malformed and forged tickets never produce pending lineage", async () => {
	const { service } = setup();
	const { attempt } = await service.begin("/sign-in");
	for (const ticket of [
		null,
		"",
		"account-id",
		"a".repeat(64),
		"A".repeat(64),
		"a".repeat(65),
	]) {
		expect((await service.receive(ticket, attempt)).state).toBe("invalid");
	}
	expect(await service.issue("forged", null)).toBeNull();
});
test("foreign or missing attempt cannot burn a legitimate ticket; ticket and attempt are one-use", async () => {
	const { service } = setup();
	const original = await service.begin("/sign-up?keep=1");
	const foreign = await service.begin("/sign-in");
	const issued = required(await service.issue(original.attempt, null));
	expect((await service.receive(issued.ticket, foreign.attempt)).state).toBe(
		"invalid",
	);
	expect((await service.receive(issued.ticket, null)).state).toBe("invalid");
	const duplicate = required(await service.issue(original.attempt, null));
	expect(
		(await service.receive(issued.ticket, original.attempt)).returnTo,
	).toBe("/sign-up?keep=1");
	expect((await service.receive(issued.ticket, original.attempt)).state).toBe(
		"invalid",
	);
	expect(
		(await service.receive(duplicate.ticket, original.attempt)).state,
	).toBe("invalid");
});
test("attempts, tickets, pending and lineage expire without waiting", async () => {
	const { service, advance, touch, pending } = setup();
	const minted = required(await service.mintLineage("enabled", touch()));
	const original = await service.begin("/sign-in");
	const issued = required(
		await service.issue(original.attempt, minted.credential),
	);
	advance(BRIDGE_TTL.ticket);
	expect((await service.receive(issued.ticket, original.attempt)).state).toBe(
		"invalid",
	);
	expect(await service.issue(original.attempt, minted.credential)).toBeNull();
	const received = await pending(minted.credential);
	advance(BRIDGE_TTL.pending);
	expect(await service.bind(received.pendingToken, "user")).toBeNull();
	advance(BRIDGE_TTL.lineage);
	expect((await pending(minted.credential)).state).toBe("unavailable");
});
test("same user repeats idempotently; user switch and simultaneous competing accounts cannot reassign", async () => {
	const { service, kv, touch, pending, advance } = setup();
	const minted = required(await service.mintLineage("enabled", touch()));
	const a = await pending(minted.credential);
	const b = await pending(minted.credential);
	const events = await Promise.all([
		service.bind(a.pendingToken, "alice"),
		service.bind(b.pendingToken, "bob"),
	]);
	expect(events.filter(Boolean)).toHaveLength(1);
	const winner = required(events.find(Boolean));
	const loser = winner.distinctId === "alice" ? "bob" : "alice";
	expect(
		await service.bind((await pending(minted.credential)).pendingToken, loser),
	).toBeNull();
	const repeat = await service.bind(
		(await pending(minted.credential)).pendingToken,
		winner.distinctId,
	);
	expect(repeat).toEqual(winner);
	expect(await service.bind(a.pendingToken, "alice")).toBeNull();
	const owner = await kv.get<{
		ownerId: string;
	}>(`acquisition-bridge:lineage:${minted.credential}`);
	expect(owner?.ownerId).toBe(winner.distinctId);
	advance(BRIDGE_TTL.lineage + 1);
	const replacement = required(
		await service.updateLineage(minted.credential, "enabled", touch()),
	);
	expect(replacement.anonymousId).not.toBe(minted.anonymousId);
});
test("simultaneous visits preserve the original first touch via revision CAS", async () => {
	const { service, touch, pending } = setup();
	const minted = required(
		await service.mintLineage("enabled", touch("?utm_source=original")),
	);
	await Promise.all([
		service.updateLineage(minted.credential, "enabled", touch("?utm_source=a")),
		service.updateLineage(minted.credential, "enabled", touch("?utm_source=b")),
	]);
	const event = required(
		await service.bind((await pending(minted.credential)).pendingToken, "user"),
	);
	expect(event.properties.$set_once.acquisition_first_utm_source).toBe(
		"original",
	);
	expect(
		["a", "b"].includes(
			event.properties.$set.acquisition_latest_non_direct_utm_source ?? "",
		),
	).toBe(true);
});
test("concurrent receives and binds consume each opaque capability once", async () => {
	const { service, touch } = setup();
	const minted = required(await service.mintLineage("enabled", touch()));
	const { attempt } = await service.begin("/sign-in");
	const { ticket } = required(await service.issue(attempt, minted.credential));
	const results = await Promise.all([
		service.receive(ticket, attempt),
		service.receive(ticket, attempt),
	]);
	expect(results.filter((result) => result.state === "enabled")).toHaveLength(
		1,
	);
	const pendingToken = results.find(
		(result) => result.pendingToken,
	)?.pendingToken;
	const events = await Promise.all([
		service.bind(pendingToken, "user"),
		service.bind(pendingToken, "user"),
	]);
	expect(events.filter(Boolean)).toHaveLength(1);
});
test("revocation during ownership claim suppresses the identify event", async () => {
	const { service, kv, touch, pending } = setup();
	const minted = required(await service.mintLineage("enabled", touch()));
	const received = await pending(minted.credential);
	const evaluate = kv.eval.bind(kv);
	let revoked = false;
	kv.eval = async (script, keys, args) => {
		if (!revoked) {
			revoked = true;
			await service.revokeLineage(minted.credential);
		}
		return evaluate(script, keys, args);
	};
	expect(await service.bind(received.pendingToken, "user")).toBeNull();
});
test("stable event UUID deduplicates the same snapshot without hiding a new latest touch", async () => {
	const { service, touch, pending, advance } = setup();
	const minted = required(
		await service.mintLineage("enabled", touch("?utm_source=one&gclid=old")),
	);
	const initial = required(
		await service.bind((await pending(minted.credential)).pendingToken, "user"),
	);
	advance(1);
	await service.updateLineage(minted.credential, "enabled", touch());
	const direct = required(
		await service.bind((await pending(minted.credential)).pendingToken, "user"),
	);
	expect(direct.uuid).toBe(initial.uuid);
	advance(1);
	await service.updateLineage(
		minted.credential,
		"enabled",
		touch("?utm_source=two"),
	);
	const latest = required(
		await service.bind((await pending(minted.credential)).pendingToken, "user"),
	);
	expect(latest.uuid).not.toBe(initial.uuid);
	expect(latest.properties.$set_once.acquisition_first_utm_source).toBe("one");
	expect(latest.properties.$set.acquisition_latest_non_direct_utm_source).toBe(
		"two",
	);
	expect(latest.properties.$set.acquisition_latest_non_direct_gclid).toBeNull();
});
test("KV failures are explicit for the HTTP layer to handle without breaking auth", async () => {
	const { service, kv } = setup();
	kv.set = async () => {
		throw new Error("KV unavailable");
	};
	await expect(service.begin("/sign-in")).rejects.toThrow("KV unavailable");
});
test("return paths reject malformed paths and open redirects", async () => {
	const { service } = setup();
	for (const path of [
		"https://evil.test/sign-in",
		"//evil.test/sign-in",
		"/\\evil.test",
		"/sign-in#fragment",
		"/sign-in\n",
		"/sign-in/../sign-up",
		"/%73ign-in",
		"/api/auth/desktop/../evil",
		"/api/auth/desktop/%2f%2fevil",
		"/api/auth/desktop.evil",
		"/dashboard",
		"/sign-in/extra",
		`/sign-in?x=${"a".repeat(8192)}`,
	]) {
		expect(validateReturnTo(path)).toBeNull();
		await expect(service.begin(path)).rejects.toThrow(
			"Invalid acquisition return path",
		);
	}
});
describe("browser-safe boundaries", () => {
	test("only bounded campaign fields, click tokens, referrer HOST and pathname survive", () => {
		const touch = required(
			collectTouchSnapshot({
				href: "https://paradev.com/landing?utm_source=google&utm_medium=cpc&utm_campaign=hello%20world&utm_content=%3Cscript%3E&utm_term=alice%40mail.test&utm_id=42&gclid=abc_123&fbclid=bad%2Fid&email=private%40mail.test#secret",
				referrer: "https://news.example.org/private?secret=raw#fragment",
			}),
		);
		expect(touch).toEqual({
			landing_pathname: "/landing",
			utm_source: "google",
			utm_medium: "cpc",
			utm_campaign: "hello world",
			utm_id: "42",
			gclid: "abc_123",
			referrer_host: "news.example.org",
		});
		expect(
			sanitizeTouchSnapshot({
				landing_pathname: "/",
				utm_source: "a".repeat(129),
				gclid: "a".repeat(257),
				referrer_host: "https://evil.test/path",
			}),
		).toEqual({ landing_pathname: "/" });
		expect(collectTouchSnapshot({ href: "not-a-url" })).toBeNull();
		expect(
			sanitizeTouchSnapshot({ landing_pathname: "/?secret=1" }),
		).toBeNull();
	});
	test("own domains, configured origins and auth providers aren't marketing referrers", () => {
		for (const host of [
			"paradev.com",
			"app.paradev.com",
			"superset.sh",
			"www.superset.sh",
			"accounts.google.com",
			"preview.example.net",
		]) {
			expect(
				collectTouchSnapshot(
					{
						href: "https://paradev.com/",
						referrer: `https://${host}/secret?token=x`,
					},
					{ internalOrigins: ["https://preview.example.net"] },
				),
			).toEqual({ landing_pathname: "/" });
		}
		expect(
			collectTouchSnapshot({
				href: "https://paradev.com/",
				referrer: "https://notparadev.com/",
			})?.referrer_host,
		).toBe("notparadev.com");
	});
});
for (const referrer of [
	"https://github.com/",
	"https://github.com/ParadevAI/Paradev",
	"https://github.com/ParadevAI/Paradev/issues/1",
	"https://github.com/ParadevAI/Paradev/discussions/1",
]) {
	test(`genuine GitHub marketing referral is first and latest non-direct: ${referrer}`, async () => {
		const { service, pending } = setup();
		const minted = required(
			await service.mintLineage(
				"enabled",
				collectTouchSnapshot({ href: "https://paradev.com/", referrer }),
			),
		);
		const event = required(
			await service.bind(
				(await pending(minted.credential)).pendingToken,
				"user",
			),
		);
		expect(event.properties.$set_once.acquisition_first_referrer_host).toBe(
			"github.com",
		);
		expect(
			event.properties.$set.acquisition_latest_non_direct_referrer_host,
		).toBe("github.com");
	});
}
test("HTTP helpers enforce exact Origin and one well-formed credential cookie", () => {
	expect(
		hasExactOrigin(
			new Request("https://app.paradev.com", {
				headers: { origin: "https://paradev.com" },
			}),
			"https://paradev.com",
		),
	).toBe(true);
	for (const origin of [
		"null",
		"https://evil.paradev.com",
		"https://paradev.com.evil.test",
		"https://paradev.com/",
	]) {
		expect(
			hasExactOrigin(
				new Request("https://app.paradev.com", { headers: { origin } }),
				"https://paradev.com",
			),
		).toBe(false);
	}
	const cookie = `${BRIDGE_COOKIES.lineage}=${"a".repeat(64)}`;
	expect(
		readBridgeCookie(
			new Request("https://paradev.com", { headers: { cookie } }),
			"lineage",
		),
	).toBe("a".repeat(64));
	expect(
		readBridgeCookie(
			new Request("https://paradev.com", {
				headers: { cookie: `${cookie}; ${cookie}` },
			}),
			"lineage",
		),
	).toBeNull();
});

function required<T>(value: T): NonNullable<T> {
	if (value === null || value === undefined)
		throw new Error("Missing fixture value");
	return value as NonNullable<T>;
}
