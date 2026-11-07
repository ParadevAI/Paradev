import { describe, expect, test } from "bun:test";
import { DnrEngine, type EngineExtension } from "./engine";
import { RulesetIndex } from "./ruleset-index";
import type { DnrRequest, Rule } from "./types";

const UBOL = "ddkjiahejlhfcafbddmgiahcphecmpfh";
const OTHER = "cjpalhdlnbpafiamejdnhcphjbkeiagm";

function extension(
	rulesets: Record<string, Rule[]>,
	overrides: Partial<EngineExtension> = {},
): EngineExtension {
	return {
		extensionId: UBOL,
		rulesets: Object.entries(rulesets).map(
			([id, rules], rank) => new RulesetIndex(id, rules, rank + 1),
		),
		hasHostAccess: () => true,
		hostAccessForAllActions: false,
		resolveExtensionPath: (path) => `chrome-extension://${UBOL}${path}`,
		...overrides,
	};
}

function engineWith(...extensions: EngineExtension[]): DnrEngine {
	const engine = new DnrEngine();
	for (const ext of extensions) engine.setExtension(ext);
	return engine;
}

function request(url: string, overrides: Partial<DnrRequest> = {}): DnrRequest {
	return {
		url,
		method: "GET",
		resourceType: "script",
		initiator: "https://news.example",
		tabId: 1,
		frameUrls: ["https://news.example/article"],
		...overrides,
	};
}

// The shapes uBO Lite's rulesets/main/*.json use.
const UBOL_DEFAULT: Rule[] = [
	{
		id: 1,
		action: { type: "block" },
		condition: {
			requestDomains: ["doubleclick.net", "googlesyndication.com"],
		},
	},
	{
		id: 2,
		action: { type: "block" },
		condition: {
			urlFilter: "/ads/banner^",
			resourceTypes: ["image", "script", "sub_frame"],
		},
	},
	{
		id: 3,
		action: { type: "block" },
		condition: {
			urlFilter: "||tracker.example^",
			domainType: "thirdParty",
		},
	},
	{
		id: 4,
		priority: 1000,
		action: { type: "allow" },
		condition: {
			urlFilter: "||doubleclick.net/allowed.js",
			initiatorDomains: ["partner.example"],
		},
	},
	{
		id: 5,
		action: {
			type: "redirect",
			redirect: { extensionPath: "/web_accessible_resources/noop.js" },
		},
		condition: {
			urlFilter: "||cdn.example/analytics.js",
			resourceTypes: ["script"],
		},
	},
	{
		id: 6,
		action: { type: "block" },
		condition: {
			regexFilter: "^https://[a-z]+\\.example/pixel-[0-9]+\\.gif$",
			resourceTypes: ["image"],
		},
	},
];

describe("matching", () => {
	const engine = engineWith(extension({ default: UBOL_DEFAULT }));

	test("blocks a request to a listed domain and its subdomains", () => {
		for (const url of [
			"https://doubleclick.net/x.js",
			"https://ad.doubleclick.net/x.js",
		]) {
			expect(engine.evaluate(request(url)).outcome).toMatchObject({
				kind: "block",
				matched: { extensionId: UBOL, rulesetId: "default", ruleId: 1 },
			});
		}
		expect(
			engine.evaluate(request("https://notdoubleclick.net/x.js")).outcome.kind,
		).toBe("none");
	});

	test("urlFilter separators, resource types and regexFilter", () => {
		const outcome = (url: string, resourceType: DnrRequest["resourceType"]) =>
			engine.evaluate(request(url, { resourceType })).outcome.kind;
		expect(outcome("https://site.example/ads/banner?x=1", "image")).toBe(
			"block",
		);
		expect(outcome("https://site.example/ads/banner", "image")).toBe("block");
		expect(outcome("https://site.example/ads/bannerx", "image")).toBe("none");
		expect(outcome("https://site.example/ads/banner", "stylesheet")).toBe(
			"none",
		);
		expect(outcome("https://img.example/pixel-42.gif", "image")).toBe("block");
		expect(outcome("https://IMG.example/pixel-42.gif", "image")).toBe("block");
		expect(outcome("https://img.example/pixel-x.gif", "image")).toBe("none");
	});

	test("domainType compares registrable domains", () => {
		const kind = (initiator: string) =>
			engine.evaluate(
				request("https://cdn.tracker.example/t.js", { initiator }),
			).outcome.kind;
		expect(kind("https://news.example")).toBe("block");
		expect(kind("https://www.tracker.example")).toBe("none");
	});

	test("a higher priority allow beats a block, only for its initiator", () => {
		const url = "https://doubleclick.net/allowed.js";
		expect(
			engine.evaluate(
				request(url, { initiator: "https://www.partner.example" }),
			).outcome,
		).toMatchObject({ kind: "allow", matched: { ruleId: 4 } });
		expect(engine.evaluate(request(url)).outcome.kind).toBe("block");
	});

	test("redirects to an extension resource", () => {
		expect(
			engine.evaluate(request("https://cdn.example/analytics.js")).outcome,
		).toEqual({
			kind: "redirect",
			url: `chrome-extension://${UBOL}/web_accessible_resources/noop.js`,
			matched: { extensionId: UBOL, rulesetId: "default", ruleId: 5 },
		});
	});

	test("main_frame is only matched when a rule names it", () => {
		expect(
			engine.evaluate(
				request("https://doubleclick.net/", { resourceType: "main_frame" }),
			).outcome.kind,
		).toBe("none");
	});

	test("non-web URLs are never touched", () => {
		expect(
			engine.evaluate(request("chrome-extension://abc/doubleclick.net/x.js"))
				.outcome.kind,
		).toBe("none");
	});
});

describe("precedence", () => {
	const blockAndAllow = (allowPriority: number): Rule[] => [
		{
			id: 1,
			priority: 5,
			action: { type: "block" },
			condition: { urlFilter: "ads" },
		},
		{
			id: 2,
			priority: allowPriority,
			action: { type: "allow" },
			condition: { urlFilter: "ads" },
		},
	];

	test("equal priority: allow beats block; lower priority allow loses", () => {
		const url = "https://site.example/ads.js";
		expect(
			engineWith(extension({ s: blockAndAllow(5) })).evaluate(request(url))
				.outcome.kind,
		).toBe("allow");
		expect(
			engineWith(extension({ s: blockAndAllow(4) })).evaluate(request(url))
				.outcome.kind,
		).toBe("block");
	});

	test("equal priority: block beats upgradeScheme beats redirect", () => {
		const rules: Rule[] = [
			{
				id: 1,
				action: {
					type: "redirect",
					redirect: { url: "https://elsewhere.example/" },
				},
				condition: { urlFilter: "||site.example" },
			},
			{
				id: 2,
				action: { type: "upgradeScheme" },
				condition: { urlFilter: "||site.example" },
			},
		];
		const engine = engineWith(extension({ s: rules }));
		expect(
			engine.evaluate(request("http://site.example/a")).outcome,
		).toMatchObject({
			kind: "redirect",
			url: "https://site.example/a",
			matched: { ruleId: 2 },
		});
		// upgradeScheme cannot act on https, so the redirect wins.
		expect(
			engine.evaluate(request("https://site.example/a")).outcome,
		).toMatchObject({
			kind: "redirect",
			url: "https://elsewhere.example/",
			matched: { ruleId: 1 },
		});
	});

	test("any extension's block beats another extension's allow", () => {
		const blocker = extension({
			s: [
				{ id: 1, action: { type: "block" }, condition: { urlFilter: "ads" } },
			],
		});
		const allower = extension(
			{
				s: [
					{
						id: 9,
						priority: 99,
						action: { type: "allow" },
						condition: { urlFilter: "ads" },
					},
				],
			},
			{ extensionId: OTHER },
		);
		expect(
			engineWith(blocker, allower).evaluate(request("https://x.example/ads"))
				.outcome,
		).toMatchObject({ kind: "block", matched: { extensionId: UBOL } });
	});

	test("session rules win over dynamic and static on a full tie", () => {
		const rule = (id: number): Rule => ({
			id,
			action: {
				type: "redirect",
				redirect: { url: `https://r${id}.example/` },
			},
			condition: { urlFilter: "||site.example" },
		});
		const engine = engineWith(
			extension({
				static: [rule(1)],
				_dynamic: [rule(2)],
				_session: [rule(3)],
			}),
		);
		expect(
			engine.evaluate(request("https://site.example/")).outcome,
		).toMatchObject({
			url: "https://r3.example/",
		});
	});
});

describe("allowAllRequests", () => {
	const rules: Rule[] = [
		{
			id: 1,
			action: { type: "block" },
			condition: { requestDomains: ["ads.example"] },
		},
		{
			id: 2,
			priority: 100,
			action: { type: "allowAllRequests" },
			condition: {
				requestDomains: ["trusted.example"],
				resourceTypes: ["main_frame", "sub_frame"],
			},
		},
		{
			id: 3,
			priority: 200,
			action: { type: "block" },
			condition: { urlFilter: "||ads.example/always^" },
		},
	];
	const engine = engineWith(extension({ _dynamic: rules }));

	test("a frame allowed by allowAllRequests lets its subresources through", () => {
		const fromTrusted = request("https://ads.example/x.js", {
			initiator: "https://trusted.example",
			frameUrls: ["https://trusted.example/page"],
		});
		expect(engine.evaluate(fromTrusted).outcome).toMatchObject({
			kind: "allow",
			matched: { ruleId: 2 },
		});
		expect(
			engine.evaluate(request("https://ads.example/x.js")).outcome.kind,
		).toBe("block");
	});

	test("it covers child frames, and a higher priority rule still blocks", () => {
		const inChild = request("https://ads.example/x.js", {
			initiator: "https://widget.example",
			frameUrls: ["https://widget.example/embed", "https://trusted.example/"],
		});
		expect(engine.evaluate(inChild).outcome.kind).toBe("allow");
		expect(
			engine.evaluate({ ...inChild, url: "https://ads.example/always" }).outcome
				.kind,
		).toBe("block");
	});
});

test("redirect and modifyHeaders need host access; block does not", () => {
	const rules: Rule[] = [
		{
			id: 1,
			action: { type: "block" },
			condition: { urlFilter: "||a.example" },
		},
		{
			id: 2,
			action: { type: "redirect", redirect: { url: "https://r.example/" } },
			condition: { urlFilter: "||b.example" },
		},
	];
	const engine = engineWith(
		extension({ s: rules }, { hasHostAccess: () => false }),
	);
	expect(engine.evaluate(request("https://a.example/")).outcome.kind).toBe(
		"block",
	);
	expect(engine.evaluate(request("https://b.example/")).outcome.kind).toBe(
		"none",
	);
});

test("modifyHeaders applies above allow priority, first set wins", () => {
	const rules: Rule[] = [
		{
			id: 1,
			priority: 2,
			action: {
				type: "modifyHeaders",
				responseHeaders: [
					{ header: "content-security-policy", operation: "remove" },
				],
				requestHeaders: [{ header: "X-Test", operation: "set", value: "high" }],
			},
			condition: { urlFilter: "||site.example" },
		},
		{
			id: 2,
			priority: 1,
			action: {
				type: "modifyHeaders",
				requestHeaders: [{ header: "x-test", operation: "set", value: "low" }],
			},
			condition: { urlFilter: "||site.example" },
		},
	];
	const decision = engineWith(extension({ s: rules })).evaluate(
		request("https://site.example/"),
	);
	expect(decision.requestHeaders).toEqual([
		{ header: "X-Test", operation: "set", value: "high", extensionId: UBOL },
	]);
	expect(decision.responseHeaders).toHaveLength(1);

	const allowed = engineWith(
		extension({
			s: [
				...rules,
				{
					id: 3,
					priority: 2,
					action: { type: "allow" },
					condition: { urlFilter: "||site.example" },
				},
			],
		}),
	).evaluate(request("https://site.example/"));
	expect(allowed.requestHeaders).toEqual([]);
});

test("redirect transform and regexSubstitution", () => {
	const engine = engineWith(
		extension({
			s: [
				{
					id: 1,
					action: {
						type: "redirect",
						redirect: {
							transform: { queryTransform: { removeParams: ["utm_source"] } },
						},
					},
					condition: {
						urlFilter: "utm_source=",
						resourceTypes: ["main_frame"],
					},
				},
				{
					id: 2,
					action: {
						type: "redirect",
						redirect: { regexSubstitution: "https://\\1.example/new" },
					},
					condition: { regexFilter: "^https://(old)\\.example/" },
				},
			],
		}),
	);
	expect(
		engine.evaluate(
			request("https://shop.example/p?id=1&utm_source=x", {
				resourceType: "main_frame",
			}),
		).outcome,
	).toMatchObject({ kind: "redirect", url: "https://shop.example/p?id=1" });
	expect(
		engine.evaluate(request("https://old.example/a")).outcome,
	).toMatchObject({
		url: "https://old.example/new",
	});
});

test("uBO Lite sized rulesets still match through the index", () => {
	const rules: Rule[] = [];
	for (let id = 1; id <= 20_000; id++) {
		rules.push({
			id,
			action: { type: "block" },
			condition: { urlFilter: `||ad${id}.example^` },
		});
	}
	for (let id = 20_001; id <= 40_000; id++) {
		rules.push({
			id,
			action: { type: "block" },
			condition: { urlFilter: `/banner${id}/*`, domainType: "thirdParty" },
		});
	}
	rules.push({
		id: 40_001,
		action: { type: "block" },
		condition: {
			requestDomains: Array.from({ length: 30_000 }, (_, i) => `t${i}.example`),
		},
	});
	const engine = engineWith(extension({ default: rules }));

	const urls = [
		"https://ad1234.example/x.js",
		"https://cdn.site.example/banner25000/img.png",
		"https://t29999.example/p",
		"https://www.news.example/static/app.bundle.js?v=12345",
	];
	expect(engine.evaluate(request(urls[0] as string)).outcome.kind).toBe(
		"block",
	);
	expect(engine.evaluate(request(urls[1] as string)).outcome.kind).toBe(
		"block",
	);
	expect(engine.evaluate(request(urls[2] as string)).outcome.kind).toBe(
		"block",
	);
	expect(engine.evaluate(request(urls[3] as string)).outcome.kind).toBe("none");
});

describe("Chrome parity", () => {
	const block = (id: number, condition: Rule["condition"]): Rule => ({
		id,
		action: { type: "block" },
		condition,
	});

	test("an IP address host only matches itself as a domain", () => {
		const engine = engineWith(
			extension({ s: [block(1, { requestDomains: ["0.1"] })] }),
		);
		expect(engine.evaluate(request("http://10.0.0.1/a.js")).outcome.kind).toBe(
			"none",
		);
		const exact = engineWith(
			extension({ s: [block(1, { requestDomains: ["10.0.0.1"] })] }),
		);
		expect(exact.evaluate(request("http://10.0.0.1/a.js")).outcome.kind).toBe(
			"block",
		);
	});

	test("a request with no initiator is third-party", () => {
		const engine = engineWith(
			extension({
				s: [
					block(1, { urlFilter: "||site.example", domainType: "firstParty" }),
				],
			}),
		);
		expect(
			engine.evaluate(
				request("https://site.example/a.js", { initiator: undefined }),
			).outcome.kind,
		).toBe("none");
		expect(
			engine.evaluate(
				request("https://site.example/a.js", {
					initiator: "https://site.example",
				}),
			).outcome.kind,
		).toBe("block");
	});

	test("navigations need host access to the URL only, not the initiator", () => {
		const engine = engineWith(
			extension(
				{
					s: [
						{
							id: 1,
							action: {
								type: "redirect",
								redirect: { url: "https://r.example/" },
							},
							condition: {
								urlFilter: "||b.example",
								resourceTypes: ["sub_frame", "script"],
							},
						},
					],
				},
				{ hasHostAccess: (url) => url.startsWith("https://b.example") },
			),
		);
		expect(
			engine.evaluate(
				request("https://b.example/frame", { resourceType: "sub_frame" }),
			).outcome,
		).toMatchObject({ kind: "redirect", url: "https://r.example/" });
		expect(
			engine.evaluate(request("https://b.example/a.js")).outcome.kind,
		).toBe("none");
	});

	test("after a set, only the same extension may append to that header", () => {
		const headerRule = (
			id: number,
			priority: number,
			operation: "set" | "append" | "remove",
		): Rule => ({
			id,
			priority,
			action: {
				type: "modifyHeaders",
				requestHeaders: [{ header: "x-test", operation, value: String(id) }],
			},
			condition: { urlFilter: "||site.example" },
		});
		const same = engineWith(
			extension({ s: [headerRule(1, 2, "set"), headerRule(2, 1, "append")] }),
		).evaluate(request("https://site.example/"));
		expect(same.requestHeaders.map((change) => change.operation)).toEqual([
			"set",
			"append",
		]);

		const other = engineWith(
			extension({ s: [headerRule(2, 1, "append")] }, { extensionId: OTHER }),
			extension({ s: [headerRule(1, 2, "set")] }),
		).evaluate(request("https://site.example/"));
		expect(other.requestHeaders.map((change) => change.operation)).toEqual([
			"set",
		]);

		const removed = engineWith(
			extension({
				s: [headerRule(1, 2, "remove"), headerRule(2, 1, "append")],
			}),
		).evaluate(request("https://site.example/"));
		expect(removed.requestHeaders.map((change) => change.operation)).toEqual([
			"remove",
		]);
	});

	test("a regexSubstitution that yields a javascript: URL does not redirect", () => {
		const engine = engineWith(
			extension({
				s: [
					{
						id: 1,
						action: {
							type: "redirect",
							redirect: { regexSubstitution: "javascript:\\1" },
						},
						condition: { regexFilter: "^https://site\\.example/(.*)$" },
					},
				],
			}),
		);
		expect(
			engine.evaluate(request("https://site.example/alert(1)")).outcome.kind,
		).toBe("none");
	});

	test("republishing an extension keeps its install order", () => {
		const redirectTo = (url: string): Rule[] => [
			{
				id: 1,
				action: { type: "redirect", redirect: { url } },
				condition: { urlFilter: "||site.example" },
			},
		];
		const older = extension(
			{ s: redirectTo("https://older.example/") },
			{ extensionId: OTHER },
		);
		const engine = engineWith(
			older,
			extension({ s: redirectTo("https://newer.example/") }),
		);
		engine.setExtension({ ...older });
		expect(
			engine.evaluate(request("https://site.example/")).outcome,
		).toMatchObject({ url: "https://newer.example/" });
	});

	test("matched lists the action taken, and header rules by direction", () => {
		const engine = engineWith(
			extension(
				{
					s: [
						{
							id: 1,
							action: {
								type: "redirect",
								redirect: { url: "https://r.example/" },
							},
							condition: { urlFilter: "||site.example" },
						},
					],
				},
				{ extensionId: OTHER },
			),
			extension({
				s: [
					block(2, { urlFilter: "||site.example" }),
					{
						id: 3,
						action: { type: "allow" },
						condition: { urlFilter: "||ok.example" },
					},
					{
						id: 4,
						priority: 2,
						action: {
							type: "modifyHeaders",
							responseHeaders: [
								{ header: "x-frame-options", operation: "remove" },
							],
						},
						condition: { urlFilter: "||ok.example" },
					},
				],
			}),
		);
		expect(engine.evaluate(request("https://site.example/")).matched).toEqual([
			{ extensionId: UBOL, rulesetId: "s", ruleId: 2 },
		]);
		const allowed = engine.evaluate(request("https://ok.example/"));
		expect(allowed.matched).toEqual([
			{ extensionId: UBOL, rulesetId: "s", ruleId: 3 },
		]);
		expect(allowed.requestHeaderRules).toEqual([]);
		expect(allowed.responseHeaderRules).toEqual([
			{ extensionId: UBOL, rulesetId: "s", ruleId: 4 },
		]);
	});
});
