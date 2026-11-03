import { expect, test } from "bun:test";
import { DnrEngine } from "./engine";
import { ExtensionRules, type PersistedRules } from "./extension-rules";
import type { Rule } from "./types";

const UBOL = "ddkjiahejlhfcafbddmgiahcphecmpfh";

// uBO Lite's manifest lists its rulesets like this; most are off by default.
const SOURCES = [
	{
		id: "ublock-filters",
		enabled: true,
		path: "/rulesets/main/ublock-filters.json",
	},
	{ id: "easyprivacy", enabled: true, path: "/rulesets/main/easyprivacy.json" },
	{
		id: "annoyances-cookies",
		enabled: false,
		path: "/rulesets/main/annoyances-cookies.json",
	},
];

const FILES: Record<string, unknown> = {
	"/rulesets/main/ublock-filters.json": [
		{
			id: 1,
			action: { type: "block" },
			condition: { requestDomains: ["ads.example"] },
		},
		{ id: 2, action: { type: "nonsense" }, condition: {} },
	],
	"/rulesets/main/easyprivacy.json": [
		{
			id: 1,
			action: { type: "block" },
			condition: { urlFilter: "||metrics.example^" },
		},
	],
	"/rulesets/main/annoyances-cookies.json": [
		{
			id: 1,
			action: { type: "block" },
			condition: { urlFilter: "/cookie-banner.js" },
		},
	],
};

function setup(saved: PersistedRules | null = null, version = "2026.1") {
	const storage = {
		saved,
		load: async () => storage.saved,
		save: async (rules: PersistedRules) => {
			storage.saved = structuredClone(rules);
		},
	};
	const rules = new ExtensionRules(
		UBOL,
		version,
		SOURCES,
		storage,
		async (path) => structuredClone(FILES[path]),
	);
	const engine = new DnrEngine();
	const publish = () =>
		engine.setExtension({
			extensionId: UBOL,
			rulesets: rules.rulesets(),
			hasHostAccess: () => true,
			hostAccessForAllActions: false,
			resolveExtensionPath: (path) => `chrome-extension://${UBOL}${path}`,
		});
	const outcome = (url: string) => {
		publish();
		return engine.evaluate({
			url,
			method: "GET",
			resourceType: "script",
			tabId: 1,
		}).outcome;
	};
	return { rules, storage, outcome };
}

test("loads the manifest's enabled rulesets and skips invalid rules", async () => {
	const { rules, outcome } = setup();
	await rules.load();
	expect(rules.getEnabledRulesets()).toEqual(["ublock-filters", "easyprivacy"]);
	expect(rules.rulesets().map((set) => [set.rulesetId, set.size])).toEqual([
		["ublock-filters", 1],
		["easyprivacy", 1],
		["_dynamic", 0],
	]);
	expect(outcome("https://ads.example/a.js")).toMatchObject({ kind: "block" });
	expect(outcome("https://site.example/cookie-banner.js").kind).toBe("none");
});

test("updateEnabledRulesets and static rule toggles persist for this version only", async () => {
	const first = setup();
	await first.rules.load();
	await first.rules.updateEnabledRulesets({
		enableRulesetIds: ["annoyances-cookies"],
		disableRulesetIds: ["easyprivacy"],
	});
	await first.rules.updateStaticRules({
		rulesetId: "ublock-filters",
		disableRuleIds: [1],
	});
	expect(first.outcome("https://site.example/cookie-banner.js").kind).toBe(
		"block",
	);
	expect(first.outcome("https://metrics.example/m").kind).toBe("none");
	expect(first.outcome("https://ads.example/a.js").kind).toBe("none");
	await expect(
		first.rules.updateEnabledRulesets({ enableRulesetIds: ["missing"] }),
	).rejects.toThrow("Invalid ruleset id: missing.");

	const restarted = setup(first.storage.saved);
	await restarted.rules.load();
	expect(restarted.rules.getEnabledRulesets()).toEqual([
		"ublock-filters",
		"annoyances-cookies",
	]);
	expect(restarted.rules.getDisabledRuleIds("ublock-filters")).toEqual([1]);

	const updated = setup(first.storage.saved, "2026.2");
	await updated.rules.load();
	expect(updated.rules.getEnabledRulesets()).toEqual([
		"ublock-filters",
		"easyprivacy",
	]);
});

test("dynamic rules persist and take effect; session rules do not persist", async () => {
	const trustSite: Rule = {
		id: 7,
		priority: 100,
		action: { type: "allow" },
		condition: { requestDomains: ["ads.example"] },
	};
	const first = setup();
	await first.rules.load();
	await first.rules.updateDynamicRules({ addRules: [trustSite] });
	await first.rules.updateSessionRules({
		addRules: [
			{
				id: 1,
				action: { type: "block" },
				condition: { urlFilter: "||session.example" },
			},
		],
	});
	expect(first.outcome("https://ads.example/a.js").kind).toBe("allow");
	expect(first.outcome("https://session.example/").kind).toBe("block");
	await expect(
		first.rules.updateDynamicRules({ addRules: [trustSite] }),
	).rejects.toThrow("does not have a unique ID");
	await expect(
		first.rules.updateDynamicRules({
			addRules: [
				{ id: 8, action: { type: "block" }, condition: { regexFilter: "(" } },
			],
		}),
	).rejects.toThrow("incorrect regular expression");

	const restarted = setup(first.storage.saved);
	await restarted.rules.load();
	expect(restarted.rules.getDynamicRules()).toEqual([trustSite]);
	expect(restarted.rules.getSessionRules()).toEqual([]);
	expect(restarted.outcome("https://ads.example/a.js").kind).toBe("allow");

	await restarted.rules.updateDynamicRules({ removeRuleIds: [7] });
	expect(restarted.outcome("https://ads.example/a.js").kind).toBe("block");
});

test("saved rules that cannot be read are never overwritten", async () => {
	const { rules, storage } = setup({ version: "2026.1", dynamicRules: [] });
	storage.load = async () => {
		throw new Error("EIO: i/o error");
	};
	const save = storage.save;
	let saves = 0;
	storage.save = async (next) => {
		saves++;
		await save(next);
	};
	await rules.load();
	await rules.updateDynamicRules({
		addRules: [
			{ id: 9, action: { type: "block" }, condition: { urlFilter: "x" } },
		],
	});
	expect(rules.getDynamicRules()).toHaveLength(1);
	expect(saves).toBe(0);
});
