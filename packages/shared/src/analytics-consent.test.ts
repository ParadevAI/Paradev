import { afterEach, beforeEach, expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { hasAnalyticsOptOut } from "./acquisition-bridge/browser";
import {
	analyticsConsentResponse,
	migrateAnalyticsOptOut,
	readMarketingAnalyticsOptOut,
} from "./analytics-consent";

const originals = new Map<string, PropertyDescriptor | undefined>();
let values: Map<string, string>;
let cookie: string;
let writes: string[];
function install(name: string, value: unknown) {
	Object.defineProperty(globalThis, name, { configurable: true, value });
}
beforeEach(() => {
	for (const name of ["window", "document", "localStorage"])
		originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
	values = new Map();
	cookie = "";
	writes = [];
	install("localStorage", {
		getItem: (key: string) => values.get(key) ?? null,
	});
	install("window", {
		location: { hostname: "paradev.com", protocol: "https:" },
	});
	install("document", {
		get cookie() {
			return cookie;
		},
		set cookie(value: string) {
			writes.push(value);
			cookie = value.split(";")[0] ?? "";
		},
	});
});
afterEach(() => {
	for (const [name, descriptor] of originals) {
		if (descriptor) Object.defineProperty(globalThis, name, descriptor);
		else Reflect.deleteProperty(globalThis, name);
	}
});

test("default and accepted choices do not create a new preference", () => {
	expect(migrateAnalyticsOptOut("choice", "project")).toBe(false);
	values.set("choice", "accepted");
	expect(migrateAnalyticsOptOut("choice", "project")).toBe(false);
	expect(writes).toEqual([]);
});

test("legacy decline exports only the native shared project opt-out, not identity", () => {
	values.set("choice", "declined");
	expect(migrateAnalyticsOptOut("choice", "project")).toBe(true);
	expect(writes).toEqual([
		"__ph_opt_in_out_project=0; Path=/; Max-Age=31536000; SameSite=Lax; Domain=paradev.com; Secure",
	]);
});

test("native denial wins over stale opt-in in either store", () => {
	values.set("__ph_opt_in_out_project", "1");
	cookie = "__ph_opt_in_out_project=0";
	expect(hasAnalyticsOptOut("choice", "project")).toBe(true);
	values.set("__ph_opt_in_out_project", "0");
	cookie = "__ph_opt_in_out_project=1";
	expect(migrateAnalyticsOptOut("choice", "project")).toBe(true);
});

test("explicit decline persists before lazy SDK even if the banner preference was not saved", () => {
	expect(migrateAnalyticsOptOut("choice", "project", true)).toBe(true);
	expect(writes[0]).toContain("__ph_opt_in_out_project=0;");
});

test("cookie export stays within an exact company root and supports legacy hosts", () => {
	values.set("choice", "declined");
	window.location.hostname = "docs.superset.sh";
	migrateAnalyticsOptOut("choice", "project");
	expect(writes[0]).toContain("Domain=superset.sh;");
	window.location.hostname = "paradev.com.attacker.test";
	migrateAnalyticsOptOut("choice", "project");
	expect(writes[1]).not.toContain("Domain=");
});

test("consent-only response reads legacy storage without initializing SDK or lineage", async () => {
	const response = analyticsConsentResponse({
		consentKey: "choice",
		posthogKey: "project</script>",
		docsOrigin: "https://docs.paradev.com",
	});
	expect(response.headers.get("Cache-Control")).toBe("no-store");
	expect(response.headers.get("Content-Security-Policy")).toContain(
		"frame-ancestors https://docs.paradev.com;",
	);
	const html = await response.text();
	expect(html.match(/<script /g)).toHaveLength(1);
	expect(html.match(/<\/script>/g)).toHaveLength(1);
	const script = html.match(/<script[^>]*>([\s\S]*)<\/script>/)?.[1];
	expect(script).toBeDefined();
	const replies: unknown[][] = [];
	values.set("choice", "declined");
	runInNewContext(script as string, {
		localStorage,
		document,
		parent: { postMessage: (...args: unknown[]) => replies.push(args) },
	});
	expect(replies).toEqual([
		[
			{ type: "superset:analytics-opt-out", optedOut: true },
			"https://docs.paradev.com",
		],
	]);
	expect(writes).toEqual([]);
});

test("cross-site consent checks stay unavailable without reading partitioned storage", async () => {
	for (const [docs, marketing] of [
		["https://docs.superset.sh", "https://paradev.com"],
		["https://docs.paradev.com", "https://superset.sh"],
		["https://docs.paradev.com", "https://paradev.com.attacker.test"],
		["https://docs.preview.test", "https://marketing.preview.test"],
		["https://docs.paradev.com", "http://paradev.com"],
		["https://docs.paradev.com", "not-an-origin"],
	] as const) {
		install("window", { location: { origin: docs } });
		expect(await readMarketingAnalyticsOptOut(marketing, 0)).toBeNull();
	}
	expect(writes).toEqual([]);
});

for (const [docs, marketing] of [
	["https://docs.paradev.com", "https://paradev.com"],
	["https://docs.superset.sh", "https://superset.sh"],
	["http://localhost:3004", "http://localhost:3002"],
	["https://preview.example.com", "https://preview.example.com"],
] as const) {
	test(`same-site consent check remains available: ${docs}`, async () => {
		let receive = (_event: unknown) => {};
		const source = {};
		install("window", {
			location: { origin: docs },
			addEventListener: (_: string, fn: typeof receive) => (receive = fn),
			removeEventListener: () => {},
		});
		install("document", {
			createElement: () => ({ contentWindow: source, remove: () => {} }),
			body: { append: () => {} },
		});
		const result = readMarketingAnalyticsOptOut(marketing);
		receive({
			origin: marketing,
			source,
			data: { type: "superset:analytics-opt-out", optedOut: false },
		});
		expect(await result).toBe(false);
	});
}

test("docs trusts only exact iframe origin and source, not URL flags/messages", async () => {
	let receive = (_event: unknown) => {};
	let removed = false;
	const source = {};
	const frame = { contentWindow: source, remove: () => (removed = true) };
	install("window", {
		location: { origin: "https://docs.paradev.com" },
		addEventListener: (_: string, fn: typeof receive) => (receive = fn),
		removeEventListener: () => {},
	});
	install("document", {
		createElement: () => frame,
		body: { append: () => {} },
	});
	const result = readMarketingAnalyticsOptOut("https://paradev.com");
	const message = {
		origin: "https://paradev.com",
		source,
		data: { type: "superset:analytics-opt-out", optedOut: false },
	};
	receive({ ...message, origin: "https://paradev.com.attacker.test" });
	receive({ ...message, source: {} });
	expect(removed).toBe(false);
	receive(message);
	expect(await result).toBe(false);
	expect(removed).toBe(true);
});

test("unavailable legacy-origin check suppresses only the current docs init", async () => {
	install("window", {
		location: { origin: "https://docs.paradev.com" },
		addEventListener: () => {},
		removeEventListener: () => {},
	});
	install("document", {
		createElement: () => ({ remove: () => {} }),
		body: { append: () => {} },
	});
	expect(
		await readMarketingAnalyticsOptOut("https://paradev.com", 0),
	).toBeNull();
	expect(writes).toEqual([]);
});
