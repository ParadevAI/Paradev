import { expect, spyOn, test } from "bun:test";
import { DnrEngine } from "./engine";
import {
	ExtensionRules,
	type PersistedRules,
	StaticRulePool,
} from "./extension-rules";
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

function setup(
	saved: PersistedRules | null = null,
	version = "2026.1",
	{
		files = FILES,
		pool = new StaticRulePool(),
		extensionId = UBOL,
	}: {
		files?: Record<string, unknown>;
		pool?: StaticRulePool;
		extensionId?: string;
	} = {},
) {
	const storage = {
		saved,
		load: async () => storage.saved,
		save: async (rules: PersistedRules) => {
			storage.saved = structuredClone(rules);
		},
	};
	const rules = new ExtensionRules(
		extensionId,
		version,
		SOURCES,
		storage,
		async (path) => structuredClone(files[path]),
		pool,
	);
	const engine = new DnrEngine();
	const publish = () =>
		engine.setExtension({
			extensionId,
			rulesets: rules.rulesets(),
			hasHostAccess: () => true,
			hostAccessForAllActions: false,
			resolveExtensionPath: (path) =>
				`chrome-extension://${extensionId}${path}`,
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
	expect(updated.rules.getDisabledRuleIds("ublock-filters")).toEqual([]);
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

const block = (id: number, condition: Rule["condition"] = {}): Rule => ({
	id,
	action: { type: "block" },
	condition: { urlFilter: `||r${id}.example`, ...condition },
});

test("an update whose save fails changes nothing", async () => {
	const { rules, storage, outcome } = setup();
	await rules.load();
	storage.save = async () => {
		throw new Error("ENOSPC: no space left on device");
	};
	await expect(
		rules.updateDynamicRules({ addRules: [block(1)] }),
	).rejects.toThrow("ENOSPC");
	expect(rules.getDynamicRules()).toEqual([]);
	expect(outcome("https://r1.example/").kind).toBe("none");

	await expect(
		rules.updateEnabledRulesets({ disableRulesetIds: ["ublock-filters"] }),
	).rejects.toThrow("ENOSPC");
	expect(rules.getEnabledRulesets()).toEqual(["ublock-filters", "easyprivacy"]);
	expect(outcome("https://ads.example/a.js").kind).toBe("block");

	await expect(
		rules.updateStaticRules({
			rulesetId: "ublock-filters",
			disableRuleIds: [1],
		}),
	).rejects.toThrow("ENOSPC");
	expect(rules.getDisabledRuleIds("ublock-filters")).toEqual([]);
	expect(outcome("https://ads.example/a.js").kind).toBe("block");
});

test("a static ruleset Chrome would ignore is not loaded or reported enabled", async () => {
	const regexRules = Array.from({ length: 1_001 }, (_, index) => ({
		id: index + 1,
		action: { type: "block" },
		condition: { regexFilter: `^https://r${index}\\.example/` },
	}));
	const { rules, outcome } = setup(null, "2026.1", {
		files: {
			...FILES,
			"/rulesets/main/ublock-filters.json": [block(1), block(1)],
			"/rulesets/main/easyprivacy.json": regexRules,
		},
	});
	await rules.load();
	expect(rules.getEnabledRulesets()).toEqual([]);
	expect(outcome("https://r1.example/").kind).toBe("none");
	await expect(
		rules.updateEnabledRulesets({ enableRulesetIds: ["easyprivacy"] }),
	).rejects.toThrow("regex rule count limit");
});

test("rule limits: disabled static, unsafe dynamic, and tab conditions", async () => {
	const { rules } = setup();
	await rules.load();
	await expect(
		rules.updateStaticRules({
			rulesetId: "ublock-filters",
			disableRuleIds: Array.from({ length: 5_001 }, (_, index) => index + 1),
		}),
	).rejects.toThrow("disabled rule count limit");
	expect(rules.getDisabledRuleIds("ublock-filters")).toEqual([]);

	const redirects = Array.from({ length: 5_001 }, (_, index) => ({
		id: index + 1,
		action: { type: "redirect", redirect: { url: "https://r.example/" } },
		condition: { urlFilter: `||r${index}.example` },
	})) as Rule[];
	await expect(
		rules.updateDynamicRules({ addRules: redirects }),
	).rejects.toThrow("unsafe rule count limit");

	const tabRule = block(1, { tabIds: [4] });
	await expect(
		rules.updateDynamicRules({ addRules: [tabRule] }),
	).rejects.toThrow("outside session rules");
	await rules.updateSessionRules({ addRules: [tabRule] });
	expect(rules.getSessionRules()).toEqual([tabRule]);
});

test("malformed saved state falls back instead of failing the load", async () => {
	const warn = spyOn(console, "warn").mockImplementation(() => {});
	const { rules } = setup({
		version: "2026.1",
		enabledRulesetIds: "easyprivacy" as never,
		disabledRuleIds: { "ublock-filters": "1" } as never,
		dynamicRules: [block(1), { id: "x" } as never],
	});
	await rules.load();
	expect(rules.getEnabledRulesets()).toEqual(["ublock-filters", "easyprivacy"]);
	expect(rules.getDynamicRules()).toEqual([block(1)]);
	expect(rules.getDisabledRuleIds("ublock-filters")).toEqual([]);
	expect(warn.mock.calls.flat().join(" ")).toContain(
		"skipped 1 saved dynamic rules",
	);
	warn.mockRestore();
});

test("extensions share the global static rule pool", async () => {
	const pool = new StaticRulePool();
	const big = Array.from({ length: 40_000 }, (_, index) => block(index + 1));
	const files = { ...FILES, "/rulesets/main/annoyances-cookies.json": big };
	const first = setup(null, "2026.1", { files, pool });
	await first.rules.load();
	expect(first.rules.getAvailableStaticRuleCount()).toBe(330_000 - 2);
	const second = setup(null, "2026.1", { files, pool, extensionId: "other" });
	await second.rules.load();
	await first.rules.updateEnabledRulesets({
		enableRulesetIds: ["annoyances-cookies"],
	});
	expect(second.rules.getAvailableStaticRuleCount()).toBe(330_000 - 10_002 - 2);
});

test("a disposed extension stops saving once its last save lands", async () => {
	const { rules, storage } = setup();
	await rules.load();
	let finishSave = () => {};
	const save = storage.save;
	let saves = 0;
	storage.save = async (next) => {
		saves++;
		await new Promise<void>((resolve) => {
			finishSave = resolve;
		});
		await save(next);
	};
	const pending = rules.updateDynamicRules({ addRules: [block(1)] });
	await Bun.sleep(0);
	let drained = false;
	const disposed = rules.dispose().then(() => {
		drained = true;
	});
	await Bun.sleep(0);
	expect(drained).toBe(false);
	finishSave();
	await pending;
	await disposed;
	expect(storage.saved?.dynamicRules).toEqual([block(1)]);
	await rules.updateDynamicRules({ addRules: [block(2)] });
	expect(saves).toBe(1);
});

test("concurrent updates from two extensions cannot both overdraw the pool", async () => {
	const pool = new StaticRulePool();
	const big = Array.from({ length: 181_000 }, (_, index) => block(index + 1));
	const files = { ...FILES, "/rulesets/main/annoyances-cookies.json": big };
	const holdSaves = (setupResult: ReturnType<typeof setup>) => {
		const release: (() => void)[] = [];
		setupResult.storage.save = () =>
			new Promise<void>((resolve) => {
				release.push(resolve);
			});
		return release;
	};
	const first = setup(null, "2026.1", { files, pool });
	const second = setup(null, "2026.1", { files, pool, extensionId: "other" });
	await first.rules.load();
	await second.rules.load();
	const releases = [holdSaves(first), holdSaves(second)];
	let settled = 0;
	const updates = [first, second].map((each) =>
		each.rules
			.updateEnabledRulesets({ enableRulesetIds: ["annoyances-cookies"] })
			.then(
				() => "ok",
				(error: Error) => error.message,
			)
			.finally(() => {
				settled++;
			}),
	);
	// Both updates are either waiting on their save or already refused.
	while (releases.flat().length + settled < 2) await Bun.sleep(5);
	for (const release of releases) for (const resolve of release) resolve();
	const results = await Promise.all(updates);
	expect(results.filter((result) => result === "ok")).toHaveLength(1);
	expect(results.join()).toContain("static rule count limit");
});

test("saved state over the limits is cut back on load", async () => {
	const regexRules = (offset: number) =>
		Array.from({ length: 600 }, (_, index) => ({
			id: offset + index,
			action: { type: "block" },
			condition: { regexFilter: `^https://r${index}\\.example/` },
		}));
	const redirects = Array.from({ length: 5_001 }, (_, index) => ({
		id: index + 1,
		action: { type: "redirect", redirect: { url: "https://r.example/" } },
		condition: { urlFilter: `||r${index}.example` },
	})) as Rule[];
	const { rules } = setup(
		{
			version: "2026.1",
			enabledRulesetIds: ["ublock-filters", "easyprivacy"],
			disabledRuleIds: {
				easyprivacy: Array.from({ length: 5_001 }, (_, index) => index + 1),
			},
			dynamicRules: redirects,
		},
		"2026.1",
		{
			files: {
				...FILES,
				"/rulesets/main/ublock-filters.json": regexRules(1),
				"/rulesets/main/easyprivacy.json": regexRules(1),
			},
		},
	);
	const warn = spyOn(console, "warn").mockImplementation(() => {});
	await rules.load();
	warn.mockRestore();
	expect(rules.getEnabledRulesets()).toEqual(["ublock-filters"]);
	expect(rules.getDisabledRuleIds("easyprivacy")).toEqual([]);
	expect(rules.getDynamicRules()).toHaveLength(5_000);
});

test("an extension unloaded before its load finishes takes nothing from the pool", async () => {
	const pool = new StaticRulePool();
	const big = Array.from({ length: 40_000 }, (_, index) => block(index + 1));
	const { rules } = setup(
		{ version: "2026.1", enabledRulesetIds: ["annoyances-cookies"] },
		"2026.1",
		{
			files: { ...FILES, "/rulesets/main/annoyances-cookies.json": big },
			pool,
		},
	);
	const loading = rules.load();
	void rules.dispose();
	await loading;
	expect(pool.capacity("other")).toBe(330_000);
});
