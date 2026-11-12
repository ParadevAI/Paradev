import { expect, test } from "bun:test";
import { createBridgeHttp } from "./http";
import {
	AcquisitionBridge,
	type AcquisitionKV,
	type IdentifyEvent,
	LINEAGE_CAS_SCRIPT,
} from "./server";

class Store implements AcquisitionKV {
	data = new Map<string, unknown>();
	async get<T>(key: string) {
		return structuredClone(this.data.get(key) ?? null) as T | null;
	}
	async getdel<T>(key: string) {
		const value = structuredClone(this.data.get(key) ?? null) as T | null;
		this.data.delete(key);
		return value;
	}
	async set(key: string, value: unknown) {
		this.data.set(key, structuredClone(value));
		return "OK";
	}
	async eval(script: string, keys: string[], args: (string | number)[]) {
		if (script !== LINEAGE_CAS_SCRIPT) return 1;
		const old = this.data.get(required(keys[0])) as
			| {
					revision: number;
			  }
			| undefined;
		if (!old || old.revision !== args[0]) return 0;
		this.data.set(required(keys[0]), JSON.parse(String(args[1])));
		return 1;
	}
}
test("transport preserves POST Origin without leaking referrer paths", async () => {
	const { http } = setup();
	const response = await http.marketing(
		new Request(
			`https://paradev.com/api/acquisition/visit?attempt=${"a".repeat(64)}`,
		),
		"visit",
	);
	expect(response.headers.get("Referrer-Policy")).toBe("origin");
	expect(response.headers.get("Content-Security-Policy")).toContain(
		"frame-ancestors 'none'",
	);
	expect(await response.text()).toContain('name="referrer" content="origin"');
});
test("a store outage during finalize preserves desktop auth state from the bounded fallback cookie", async () => {
	const { http, kv } = setup();
	const returnTo =
		"/auth/desktop/success?desktop_state=retained&desktop_protocol=superset";
	const begin = await http.web(
		new Request(
			`https://app.superset.sh/api/acquisition/begin?returnTo=${encodeURIComponent(returnTo)}`,
		),
		"begin",
	);
	kv.get = async () => {
		throw new Error("offline");
	};
	const response = await http.web(
		new Request("https://app.superset.sh/api/acquisition/finalize", {
			headers: {
				Cookie: `${cookiePair(begin, "__Host-acq_attempt")}; ${cookiePair(begin, "__Host-acq_return")}`,
			},
		}),
		"finalize",
	);
	const target = new URL(
		response.headers.get("Location") ?? "https://invalid.test",
	);
	expect(target.searchParams.get("desktop_state")).toBe("retained");
	expect(target.searchParams.get("_acq")).toBe("1");
});
test("an unavailable marketing release bypasses the roundtrip without changing auth", async () => {
	const http = createBridgeHttp({
		kv: new Store(),
		marketingOrigin: "https://paradev.com",
		webOrigin: "https://app.superset.sh",
		consentKey: "test-consent",
		posthogKey: "phc_fixture",
		marketingAvailable: async () => false,
	});
	const response = await http.web(
		new Request(
			"https://app.superset.sh/api/acquisition/begin?returnTo=%2Fsign-up",
		),
		"begin",
	);
	expect(response.headers.get("Location")).toBe(
		"https://app.superset.sh/sign-up?_acq=1",
	);
});
const marketing = "https://paradev.com";
const web = "https://app.superset.sh";
const cookiePair = (response: Response, name: string) =>
	response.headers
		.getSetCookie()
		.reverse()
		.find((c) => c.startsWith(`${name}=`))
		?.split(";")[0] ?? "";
function setup() {
	const kv = new Store();
	const http = createBridgeHttp({
		kv,
		marketingOrigin: marketing,
		webOrigin: web,
		consentKey: "test-consent",
		posthogKey: "phc_fixture",
	});
	function post(origin: string, action: string, input: unknown, cookie = "") {
		return new Request(`${origin}/api/acquisition/${action}`, {
			method: "POST",
			headers: {
				Origin: origin,
				"Content-Type": "application/json",
				Cookie: cookie,
			},
			body: JSON.stringify(input),
		});
	}
	async function journey(returnTo = "/sign-up", optedOut: unknown = false) {
		const lineage = await http.marketing(
			post(marketing, "lineage", {
				optedOut,
				touch: {
					landing_pathname: "/conductor",
					utm_source: "google",
					utm_medium: "cpc",
					secret: "drop",
				},
			}),
			"lineage",
		);
		const anonymousId = (await lineage.json()).anonymousId;
		const marketingCookie = cookiePair(lineage, "__Host-acq_lineage");
		const begin = await http.web(
			new Request(
				`${web}/api/acquisition/begin?returnTo=${encodeURIComponent(returnTo)}`,
			),
			"begin",
		);
		const attempt = new URL(
			required(begin.headers.get("Location")),
		).searchParams.get("attempt");
		const attemptCookie = cookiePair(begin, "__Host-acq_attempt");
		const issue = await http.marketing(
			post(marketing, "issue", { attempt, optedOut }, marketingCookie),
			"issue",
		);
		const { ticket } = await issue.json();
		const receive = await http.web(
			new Request(`${web}/api/acquisition/receive`, {
				method: "POST",
				headers: { Origin: marketing },
				body: new URLSearchParams({ ticket }),
			}),
			"receive",
		);
		expect(receive.status).toBe(303);
		expect(receive.headers.get("Cache-Control")).toBe("no-store");
		const finalize = await http.web(
			new Request(required(receive.headers.get("Location")), {
				headers: {
					Cookie: `${attemptCookie}; ${cookiePair(receive, "__Host-acq_staged")}`,
				},
			}),
			"finalize",
		);
		return {
			anonymousId,
			marketingCookie,
			attemptCookie,
			finalize,
			pendingCookie: cookiePair(finalize, "__Host-acq_pending"),
		};
	}
	return { kv, http, post, journey };
}
for (const returnTo of [
	"/sign-up",
	"/sign-in?redirect=%2Fworkspace",
	"/auth/desktop/success?desktop_state=state&desktop_protocol=superset&desktop_local_callback=http%3A%2F%2F127.0.0.1%3A4567%2Fauth%2Fcallback",
]) {
	test(`HTTP journey links tagged source only after authenticated bind: ${returnTo}`, async () => {
		const { http, post, journey } = setup();
		const result = await journey(returnTo);
		const target = new URL(required(result.finalize.headers.get("Location")));
		expect(target.searchParams.get("_acq")).toBe("1");
		target.searchParams.delete("_acq");
		expect(target.pathname + target.search).toBe(returnTo);
		const events: IdentifyEvent[] = [];
		expect(
			(
				await http.bind(
					post(web, "bind", {}, result.pendingCookie),
					null,
					async (e) => {
						events.push(e);
					},
				)
			).status,
		).toBe(401);
		await http.bind(
			post(web, "bind", {}, result.pendingCookie),
			"account-a",
			async (e) => {
				events.push(e);
			},
		);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			distinctId: "account-a",
			properties: {
				$anon_distinct_id: result.anonymousId,
				$set_once: { acquisition_first_utm_source: "google" },
			},
		});
		expect(JSON.stringify(events)).not.toContain("secret");
		await http.bind(
			post(web, "bind", {}, result.pendingCookie),
			"account-b",
			async (e) => {
				events.push(e);
			},
		);
		expect(events).toHaveLength(1);
	});
}
test("HTTP explicit opt-out, unreadable state and revocation suppress custom capture", async () => {
	for (const optedOut of [true, null]) {
		const { http, post, journey } = setup();
		const result = await journey("/sign-up", optedOut);
		const events: unknown[] = [];
		await http.bind(
			post(web, "bind", {}, result.pendingCookie),
			"user",
			async (e) => {
				events.push(e);
			},
		);
		expect(events).toHaveLength(0);
	}
	const { http, post, journey } = setup();
	const result = await journey();
	await http.marketing(
		post(marketing, "lineage", { optedOut: true }, result.marketingCookie),
		"lineage",
	);
	const events: unknown[] = [];
	await http.bind(
		post(web, "bind", {}, result.pendingCookie),
		"user",
		async (e) => {
			events.push(e);
		},
	);
	expect(events).toHaveLength(0);
});
for (const priorSource of [false, true]) {
	test(`GitHub OAuth transport cannot invent/replace acquisition; prior source=${priorSource}`, async () => {
		const { http, post } = setup();
		const lineage = priorSource
			? await http.marketing(
					post(marketing, "lineage", {
						optedOut: false,
						touch: { landing_pathname: "/", referrer_host: "github.com" },
					}),
					"lineage",
				)
			: null;
		const marketingCookie = lineage
			? cookiePair(lineage, "__Host-acq_lineage")
			: "";
		const begin = await http.web(
			new Request(
				`${web}/api/acquisition/begin?returnTo=%2Fauth%2Fdesktop%2Fsuccess`,
			),
			"begin",
		);
		const attempt = new URL(
			required(begin.headers.get("Location")),
		).searchParams.get("attempt");
		const issueRequest = post(
			marketing,
			"issue",
			{
				attempt,
				optedOut: false,
				touch: { landing_pathname: "/", referrer_host: "github.com" },
			},
			marketingCookie,
		);
		issueRequest.headers.set(
			"Referer",
			"https://github.com/login/oauth/authorize",
		);
		const issued = await http.marketing(issueRequest, "issue");
		const { ticket } = await issued.json();
		const receive = await http.web(
			new Request(`${web}/api/acquisition/receive`, {
				method: "POST",
				headers: { Origin: marketing },
				body: new URLSearchParams({ ticket }),
			}),
			"receive",
		);
		const final = await http.web(
			new Request(`${web}/api/acquisition/finalize`, {
				headers: {
					Cookie: `${cookiePair(begin, "__Host-acq_attempt")}; ${cookiePair(receive, "__Host-acq_staged")}`,
				},
			}),
			"finalize",
		);
		const events: IdentifyEvent[] = [];
		await http.bind(
			post(web, "bind", {}, cookiePair(final, "__Host-acq_pending")),
			"user",
			async (e) => {
				events.push(e);
			},
		);
		expect(events).toHaveLength(priorSource ? 1 : 0);
		if (priorSource) {
			expect(
				events[0]?.properties.$set_once.acquisition_first_referrer_host,
			).toBe("github.com");
			expect(
				events[0]?.properties.$set.acquisition_latest_non_direct_referrer_host,
			).toBe("github.com");
		}
	});
}
test("foreign origins cannot mint, stage, or bind and oversized input is rejected", async () => {
	const { http } = setup();
	for (const [origin, action] of [
		[marketing, "lineage"],
		[web, "receive"],
		[web, "bind"],
	]) {
		const request = new Request(`${origin}/api/acquisition/${action}`, {
			method: "POST",
			headers: { Origin: "https://attacker.test" },
			body: "{}",
		});
		const response =
			origin === marketing
				? await http.marketing(request, required(action))
				: action === "bind"
					? await http.bind(request, "user", async () => {})
					: await http.web(request, required(action));
		expect(response.status).toBe(403);
	}
	const oversized = new Request(`${marketing}/api/acquisition/lineage`, {
		method: "POST",
		headers: { Origin: marketing },
		body: "x".repeat(9000),
	});
	expect((await http.marketing(oversized, "lineage")).status).toBe(503);
});
test("foreign-browser staging cannot import another browser's lineage", async () => {
	const { kv, http } = setup();
	const bridge = new AcquisitionBridge(kv);
	const lineage = required(
		await bridge.mintLineage("enabled", {
			landing_pathname: "/",
		}),
	);
	const first = await bridge.begin("/sign-up");
	const second = await bridge.begin("/sign-in");
	const ticket = required(
		await bridge.issue(first.attempt, lineage.credential),
	).ticket;
	const result = await http.web(
		new Request(`${web}/api/acquisition/finalize`, {
			headers: {
				Cookie: `__Host-acq_attempt=${second.attempt}; __Host-acq_staged=${ticket}`,
			},
		}),
		"finalize",
	);
	expect(cookiePair(result, "__Host-acq_pending")).toBe("__Host-acq_pending=");
	expect(new URL(required(result.headers.get("Location"))).pathname).toBe(
		"/sign-in",
	);
});
test("missing transport ticket and store outages continue auth without a new redirect loop", async () => {
	const { kv, http } = setup();
	const bridge = new AcquisitionBridge(kv);
	const attempt = await bridge.begin(
		"/auth/desktop/success?desktop_state=preserved",
	);
	const result = await http.web(
		new Request(`${web}/api/acquisition/finalize`, {
			headers: { Cookie: `__Host-acq_attempt=${attempt.attempt}` },
		}),
		"finalize",
	);
	expect(
		new URL(required(result.headers.get("Location"))).searchParams.get(
			"desktop_state",
		),
	).toBe("preserved");
	kv.eval = async () => {
		throw new Error("offline");
	};
	const fallback = await http.web(
		new Request(`${web}/api/acquisition/begin?returnTo=%2Fsign-up`),
		"begin",
	);
	expect(fallback.status).toBe(303);
	expect(fallback.headers.get("Location")).toBe(`${web}/sign-up?_acq=1`);
});

test("transport script escapes less-than characters in configuration literals", async () => {
	const http = createBridgeHttp({
		kv: new Store(),
		marketingOrigin: marketing,
		webOrigin: web,
		consentKey: "</script><script>bad()</script>",
		posthogKey: "phc_fixture",
	});
	const response = await http.marketing(
		new Request(`${marketing}/api/acquisition/visit?attempt=${"a".repeat(64)}`),
		"visit",
	);
	const html = await response.text();
	expect(html).not.toContain("</script><script>bad()");
	expect(html).toContain("\\u003c/script>");
});

test("HTTP carries client intent ordering through a delayed enable after opt-out", async () => {
	const { http, post, journey } = setup();
	const original = await journey();
	await http.marketing(
		post(
			marketing,
			"lineage",
			{ optedOut: true, intentAt: Date.now() + 2 },
			original.marketingCookie,
		),
		"lineage",
	);
	const late = await http.marketing(
		post(
			marketing,
			"lineage",
			{ optedOut: false, intentAt: 1 },
			original.marketingCookie,
		),
		"lineage",
	);
	expect((await late.json()).anonymousId).toBeNull();
});

for (const optedOut of [false, true]) {
	test(`GitHub direct web entry survives redirect without exporting referrer paths; optedOut=${optedOut}`, async () => {
		const { http, post } = setup();
		const begin = await http.web(
			new Request(`${web}/api/acquisition/begin?returnTo=%2Fsign-up`, {
				headers: {
					Referer: "https://github.com/ParadevAI/Paradev/issues/1?secret=drop",
				},
			}),
			"begin",
		);
		expect(begin.headers.get("Referrer-Policy")).toBe("no-referrer");
		const location = new URL(required(begin.headers.get("Location")));
		expect(location.searchParams.has("referrer")).toBe(false);
		const issued = await http.marketing(
			post(marketing, "issue", {
				attempt: location.searchParams.get("attempt"),
				optedOut,
			}),
			"issue",
		);
		const { ticket } = await issued.json();
		const receive = await http.web(
			new Request(`${web}/api/acquisition/receive`, {
				method: "POST",
				headers: { Origin: marketing },
				body: new URLSearchParams({ ticket }),
			}),
			"receive",
		);
		const final = await http.web(
			new Request(`${web}/api/acquisition/finalize`, {
				headers: {
					Cookie: `${cookiePair(begin, "__Host-acq_attempt")}; ${cookiePair(receive, "__Host-acq_staged")}`,
				},
			}),
			"finalize",
		);
		const events: IdentifyEvent[] = [];
		await http.bind(
			post(web, "bind", {}, cookiePair(final, "__Host-acq_pending")),
			"user",
			async (event) => {
				events.push(event);
			},
		);
		expect(events).toHaveLength(optedOut ? 0 : 1);
		if (!optedOut) {
			expect(
				events[0]?.properties.$set_once.acquisition_first_referrer_host,
			).toBe("github.com");
			expect(
				events[0]?.properties.$set.acquisition_latest_non_direct_referrer_host,
			).toBe("github.com");
			expect(cookiePair(issued, "__Host-acq_lineage")).not.toBe("");
		}
		expect(JSON.stringify(events)).not.toContain("secret");
	});
}

function required<T>(value: T): NonNullable<T> {
	if (value === null || value === undefined)
		throw new Error("Missing fixture value");
	return value as NonNullable<T>;
}
