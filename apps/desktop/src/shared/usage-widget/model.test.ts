import { describe, expect, test } from "bun:test";
import { quotaWindowReading } from "../usage-reading";
import {
	displayWindows,
	edgeAccounts,
	edgeHandleHeight,
	edgeHandleLayout,
	exhaustedQuota,
	isCurrentWindow,
	isFresh,
	metricValue,
	panelBounds,
	preferredWindow,
	projectWidgetAccounts,
	type QuotaAccount,
	quotaColor,
	readWidgetPreferences,
	selectedAccount,
	selectedWindow,
	setWidgetAccountHidden,
	type WidgetAccount,
	widgetAccountGroups,
	widgetAccountInitials,
	widgetPreferencesPatchSchema,
	widgetUsageReading,
} from "./model";

const now = Date.parse("2026-10-05T18:00:00Z");
const account = (patch: Partial<WidgetAccount> = {}): WidgetAccount => ({
	id: "a",
	provider: "claude",
	label: "Company A",
	email: "a@example.test",
	plan: "Max",
	isDefault: true,
	status: "ok",
	identityChanged: false,
	billing: "subscription",
	windows: [
		{ id: "seven_day", label: "Weekly", usedPercent: 22, resetsAt: null },
	],
	checkedAt: new Date(now).toISOString(),
	historical: false,
	...patch,
});

test("widget history shares dashboard visibility without making reset or exhaustion claims", () => {
	const a = account({
		status: "unavailable",
		historical: true,
		checkedAt: new Date(now - 30 * 60_000).toISOString(),
		windows: [
			{
				id: "seven_day",
				label: "Weekly",
				usedPercent: 100,
				resetsAt: new Date(now - 1).toISOString(),
			},
		],
	});
	const reading = widgetUsageReading(a, false, now);
	expect(reading.windows).toEqual(a.windows);
	expect(quotaWindowReading(reading, selectedWindow(a, "weekly"), now)).toBe(
		"awaiting_refresh",
	);
	expect(isFresh(a, false, now)).toBe(false);
	expect(exhaustedQuota(a, false, now)).toBeNull();
	expect(
		widgetUsageReading({ ...a, identityChanged: true }, false, now).windows,
	).toEqual([]);
	expect(
		widgetUsageReading(
			{ ...a, checkedAt: new Date(now - 60 * 60_000 - 1).toISOString() },
			false,
			now,
		).windows,
	).toEqual([]);
});

describe("per-account usage selection", () => {
	test("pin selects the exact account, never averages or substitutes after removal", () => {
		const a = account();
		const b = account({
			id: "b",
			isDefault: false,
			windows: [
				{ id: "seven_day", label: "Weekly", usedPercent: 91, resetsAt: null },
			],
		});
		const p = readWidgetPreferences({ pinnedAccounts: { claude: "b" } });
		expect(selectedAccount([a, b], "claude", p)).toBe(b);
		expect(selectedAccount([a], "claude", p)).toBeUndefined();
		expect(selectedAccount([a, b], "claude", readWidgetPreferences({}))).toBe(
			a,
		);
		expect(
			selectedAccount(
				[account({ isDefault: false }), b],
				"claude",
				readWidgetPreferences({}),
			),
		).toBeUndefined();
	});
	test("Codex weekly-only primary is never mislabeled as a session limit", () => {
		const a = account({
			provider: "codex",
			windows: [
				{
					id: "primary",
					label: "Weekly",
					windowSeconds: 604800,
					usedPercent: 25,
					resetsAt: null,
				},
			],
		});
		expect(selectedWindow(a, "weekly")?.usedPercent).toBe(25);
		expect(selectedWindow(a, "session")).toBeUndefined();
		a.windows[0].windowSeconds = 18000;
		expect(selectedWindow(a, "weekly")).toBeUndefined();
		expect(selectedWindow(a, "session")).toBeDefined();
		delete a.windows[0].windowSeconds;
		expect(selectedWindow(a, "session")).toBeUndefined();
	});
	test("model-specific quota never becomes the general quota", () => {
		const a = account({
			windows: [
				{
					id: "seven_day_sonnet",
					label: "Weekly · Sonnet",
					usedPercent: 0,
					resetsAt: null,
				},
			],
		});
		expect(selectedWindow(a, "weekly")).toBeUndefined();
	});
	test("only current, healthy readings reach the menu bar", () => {
		expect(isFresh(account(), false, now)).toBe(true);
		for (const patch of [
			{ status: "token_stale" as const },
			{ historical: true },
			{ identityChanged: true },
			{ checkedAt: null },
			{ checkedAt: new Date(now - 360001).toISOString() },
			{ checkedAt: new Date(now + 60001).toISOString() },
		])
			expect(isFresh(account(patch), false, now)).toBe(false);
		expect(isFresh(account(), true, now)).toBe(false);
		expect(metricValue(account().windows[0], "remaining")).toBe(78);
		expect(metricValue(account().windows[0], "used")).toBe(22);
	});
});

test("projection uses public quota identities, strips credential paths and keeps offline history non-live", () => {
	const source = {
		agent: "claude",
		accountKey: "/private/credentials",
		sourceLabel: "Company",
		quotaIdentity: "a".repeat(64),
		sourceId: "b".repeat(64),
		email: "a@example.test",
		plan: "max",
		isDefault: true,
		status: "ok",
		credentialKind: "subscription",
		selection: "/private/profile",
		fetchedAt: new Date(now),
		windows: [
			{ id: "seven_day", label: "Weekly", usedPercent: 120, resetsAt: null },
			{ id: "bad", label: "bad", usedPercent: NaN, resetsAt: null },
		],
		creditsBalance: null,
		extraUsage: null,
		statusDetail: null,
	} satisfies QuotaAccount;
	const id = `claude:${source.quotaIdentity}`;
	const result = projectWidgetAccounts([source], {
		[id]: { label: "Company", color: "#123456" },
	});
	expect(projectWidgetAccounts([{ ...source, discoveryFailed: true }])).toEqual(
		[],
	);
	expect(result).toHaveLength(1);
	expect(result[0].windows).toHaveLength(1);
	expect(result[0].windows[0].usedPercent).toBe(100);
	expect(result[0].color).toBe("#123456");
	expect(JSON.stringify(result)).not.toContain("/private/");
	const changed = projectWidgetAccounts(
		[{ ...source, quotaIdentity: "c".repeat(64) }],
		{ [id]: { label: "Wrong", color: "#123456" } },
	);
	expect(changed[0].color).toBeUndefined();
	expect(changed[0].label).toBe(source.email);
	const stale = projectWidgetAccounts([source], {}, true)[0];
	expect(stale.historical).toBe(true);
	expect(stale.checkedAt).toBe(new Date(now).toISOString());
	expect(widgetUsageReading(stale, true, now).freshness).toBe("stale");
});

test("preferences validate bounded provider keys and recover corrupt saved data", () => {
	expect(readWidgetPreferences({ menuBar: "invalid" }).menuBar).toBe("off");
	expect(
		readWidgetPreferences({ providers: ["claude", "claude"] }).providers,
	).toEqual(["claude"]);
	expect(
		widgetPreferencesPatchSchema.safeParse({ pinnedAccounts: { unknown: "a" } })
			.success,
	).toBe(false);
	expect(
		widgetPreferencesPatchSchema.safeParse({ pinnedAccounts: { claude: "a" } })
			.success,
	).toBe(true);
});

test("panels stay inside work area with negative monitor coordinates and small displays", () => {
	const work = { x: -1920, y: 30, width: 1920, height: 1050 };
	const anchor = { x: -1910, y: 0, width: 20, height: 24 };
	expect(panelBounds(work, anchor, "menu", true, 2).x).toBe(-1920);
	const edge = panelBounds(work, anchor, "edge", false, 2);
	expect(edge.x + edge.width).toBe(0);
	expect(edge.width).toBe(46);
	const small = panelBounds(
		{ x: 0, y: 0, width: 300, height: 400 },
		anchor,
		"menu",
		true,
		5,
	);
	expect(small).toEqual({ x: 0, y: 0, width: 300, height: 400 });
});

test("preference patches preserve unrelated settings", () => {
	expect(widgetPreferencesPatchSchema.parse({ edge: true })).toEqual({
		edge: true,
	});
	expect(
		widgetPreferencesPatchSchema.parse({ pinnedAccounts: { claude: "b" } }),
	).toEqual({ pinnedAccounts: { claude: "b" } });
	const prior = readWidgetPreferences({
		menuBar: "providers",
		metric: "used",
		hostId: "company-a",
	});
	const next = readWidgetPreferences({
		...prior,
		...widgetPreferencesPatchSchema.parse({ edge: true }),
	});
	expect(next.menuBar).toBe("providers");
	expect(next.metric).toBe("used");
	expect(next.hostId).toBe("company-a");
});

test("a reset boundary invalidates quick-view quota until a new observation", () => {
	const a = account();
	const w = { ...a.windows[0], resetsAt: new Date(now).toISOString() };
	a.windows = [w];
	expect(isCurrentWindow(a, w, false, now)).toBe(false);
	const next = { ...w, resetsAt: new Date(now + 1000).toISOString() };
	a.windows = [next];
	expect(isCurrentWindow(a, next, false, now)).toBe(true);
});

test("all accounts are visible after migrating old notch pins", () => {
	const accounts = [
		account(),
		account({ id: "b", isDefault: false }),
		account({ id: "c", provider: "codex" }),
		account({ id: "d", provider: "grok" }),
	];
	for (const pins of [null, [], ["b"]]) {
		const prefs = readWidgetPreferences({
			edgePinnedAccountIds: pins,
			pinnedAccounts: { claude: "b" },
			providers: ["claude"],
		});
		expect(edgeAccounts(accounts, prefs).map((a) => a.id)).toEqual([
			"a",
			"b",
			"c",
			"d",
		]);
		expect(prefs.hiddenAccountIds).toEqual([]);
		expect(prefs.pinnedAccounts).toEqual({ claude: "b" });
		expect(prefs).not.toHaveProperty("edgePinnedAccountIds");
	}
});

test("hide and restore preserve exact identities, account defaults and menu selection", () => {
	const accounts = [account(), account({ id: "b", isDefault: false })];
	const prefs = readWidgetPreferences({ pinnedAccounts: { claude: "b" } });
	const hidden = {
		...prefs,
		hiddenAccountIds: setWidgetAccountHidden(accounts, prefs, "b", true),
	};
	expect(edgeAccounts(accounts, hidden).map((a) => a.id)).toEqual(["a"]);
	expect(hidden.pinnedAccounts).toEqual(prefs.pinnedAccounts);
	expect(accounts[0].isDefault).toBe(true);
	expect(accounts[1].isDefault).toBe(false);
	expect(setWidgetAccountHidden(accounts, hidden, "b", true)).toEqual(["b"]);
	expect(setWidgetAccountHidden(accounts, hidden, "b", false)).toEqual([]);
	expect(() =>
		setWidgetAccountHidden(accounts, prefs, "missing", true),
	).toThrow("Account unavailable");
	const allHidden = {
		...prefs,
		hiddenAccountIds: ["a", "b", "temporarily-unavailable"],
	};
	expect(edgeAccounts(accounts, allHidden)).toEqual([]);
	expect(
		widgetAccountGroups(accounts, allHidden, "", null)[0].accounts,
	).toEqual([]);
	const restoredList = widgetAccountGroups(
		accounts,
		allHidden,
		"",
		null,
		true,
	)[0].accounts;
	expect(restoredList.map((a) => a.account.id)).toEqual(["a", "b"]);
	expect(restoredList.every((a) => a.hidden)).toBe(true);
	expect(
		widgetAccountGroups(accounts, hidden, "#2", null, true)[0].accounts,
	).toEqual([]);
	expect(setWidgetAccountHidden(accounts, allHidden, "a", false)).toContain(
		"temporarily-unavailable",
	);
	expect(
		edgeAccounts(accounts, { ...allHidden, hiddenAccountIds: [] }),
	).toEqual(accounts);
});

test("254 accounts remain accessible without a pin limit, within a bounded viewport", () => {
	const accounts = Array.from({ length: 254 }, (_, i) =>
		account({ id: `id-${i}`, isDefault: i === 0, label: `Studio ${i}` }),
	);
	const prefs = readWidgetPreferences({
		edgePinnedAccountIds: ["id-253", "id-11", "id-0"],
	});
	expect(edgeAccounts(accounts, prefs)).toEqual(accounts);
	expect(new Set(edgeAccounts(accounts, prefs).map((a) => a.id)).size).toBe(
		254,
	);
	const hidden = {
		...prefs,
		hiddenAccountIds: accounts.slice(0, 253).map((a) => a.id),
	};
	expect(edgeAccounts(accounts, hidden)).toEqual([accounts[253]]);
	expect(
		widgetAccountGroups(accounts, hidden, "Studio 253", "claude")[0].accounts[0]
			.account.id,
	).toBe("id-253");
	expect(
		widgetAccountGroups(accounts, hidden, "Studio 0", "claude")[0].accounts,
	).toHaveLength(0);
	expect(
		widgetAccountGroups(accounts, hidden, "Studio 0", "claude", true)[0]
			.accounts[0].hidden,
	).toBe(true);
	expect(edgeHandleHeight(5)).toBe(322);
	expect(edgeHandleHeight(254)).toBe(13270);
	expect(edgeHandleHeight(0)).toBe(62);
	const work = { x: -800, y: 0, width: 800, height: 250 };
	expect(panelBounds(work, work, "edge", false, 254)).toEqual({
		x: -782,
		y: 0,
		width: 782,
		height: 250,
	});
	const persisted = readWidgetPreferences(JSON.parse(JSON.stringify(hidden)));
	expect(edgeAccounts(accounts, persisted)).toEqual([accounts[253]]);
	expect(
		widgetPreferencesPatchSchema.parse({ hiddenAccountIds: ["a", "a"] }),
	).toEqual({ hiddenAccountIds: ["a"] });
	expect(
		widgetPreferencesPatchSchema.safeParse({
			hiddenAccountIds: Array(5001).fill("a"),
		}).success,
	).toBe(false);
});

test("seven accounts fit without scrolling and use columns only when the display requires them", () => {
	const roomy = edgeHandleLayout(7, { width: 1440, height: 900 });
	expect(roomy).toEqual({
		width: 46,
		height: 426,
		columns: 1,
		rows: 7,
		itemHeight: 52,
	});
	const compact = edgeHandleLayout(7, { width: 1440, height: 420 });
	expect(compact.columns).toBe(1);
	expect(compact.itemHeight).toBe(51);
	expect(compact.height).toBe(419);
	const short = edgeHandleLayout(7, { width: 1440, height: 350 });
	expect(short.columns).toBe(2);
	expect(short.rows * short.columns).toBeGreaterThanOrEqual(7);
	expect(short.height).toBeLessThanOrEqual(350);
	expect(short.itemHeight).toBeGreaterThanOrEqual(50);
	const bounds = panelBounds(
		{ x: -1440, y: 30, width: 1440, height: 350 },
		{ x: 0, y: 0, width: 1, height: 1 },
		"edge",
		false,
		7,
	);
	expect(bounds.width).toBe(short.width);
	expect(bounds.height).toBe(short.height);
	expect(bounds.x + bounds.width).toBe(0);
});

test.each([
	[8, 900, 1, 8, 46, 478],
	[20, 900, 2, 10, 92, 582],
	[8, 350, 2, 4, 92, 270],
	[20, 350, 4, 5, 184, 322],
])("all %i accounts fit the collapsed grid in a %i DIP work area", (count, height, columns, rows, width, widgetHeight) => {
	const work = { x: -1440, y: 30, width: 1360, height };
	const display = { x: -1440, y: 0, width: 1440, height: height + 30 };
	const layout = edgeHandleLayout(count, work);
	expect(layout).toEqual({
		width,
		height: widgetHeight,
		columns,
		rows,
		itemHeight: 52,
	});
	expect(layout.columns * layout.rows).toBeGreaterThanOrEqual(count);
	expect(layout.rows * layout.itemHeight + 62).toBe(layout.height);
	expect(layout.height).toBeLessThanOrEqual(work.height);
	expect(layout.width).toBeLessThanOrEqual(work.width);
	expect(layout.itemHeight).toBeGreaterThanOrEqual(50);
	const bounds = panelBounds(work, display, "edge", false, count, 548, display);
	expect(bounds.width).toBe(layout.width);
	expect(bounds.height).toBe(layout.height);
	expect(bounds.x + bounds.width).toBe(display.x + display.width);
	expect(bounds.x).toBeGreaterThanOrEqual(display.x);
	expect(bounds.y).toBeGreaterThanOrEqual(work.y);
	expect(bounds.y + bounds.height).toBeLessThanOrEqual(work.y + work.height);
});

test.each([
	8, 20,
])("only explicit hiding removes any of %i collapsed account identities", (count) => {
	const accounts = Array.from({ length: count }, (_, i) =>
		account({
			id: `fixture-${i}`,
			provider: i % 2 === 0 ? "claude" : "codex",
			isDefault: i === 0,
		}),
	);
	const original = structuredClone(accounts);
	const prefs = readWidgetPreferences({
		edgePinnedAccountIds: ["fixture-0"],
		pinnedAccounts: { claude: "fixture-0", codex: "fixture-1" },
		providers: ["claude"],
	});
	const ids = (values: WidgetAccount[]) => values.map((a) => a.id).sort();
	const visible = edgeAccounts(accounts, prefs);
	expect(ids(visible)).toEqual(ids(accounts));
	expect(new Set(visible.map((a) => a.id)).size).toBe(count);
	const hiddenId = `fixture-${count - 1}`;
	const hidden = {
		...prefs,
		hiddenAccountIds: setWidgetAccountHidden(accounts, prefs, hiddenId, true),
	};
	expect(ids(edgeAccounts(accounts, hidden))).toEqual(
		ids(accounts.filter((a) => a.id !== hiddenId)),
	);
	const restored = {
		...hidden,
		hiddenAccountIds: setWidgetAccountHidden(accounts, hidden, hiddenId, false),
	};
	expect(ids(edgeAccounts(accounts, restored))).toEqual(ids(accounts));
	expect(restored).toEqual(prefs);
	expect(accounts).toEqual(original);
});

test("initials preserve private labels and disambiguate duplicate account names", () => {
	const sv = account({ label: "SuccessVariable" });
	const en = account({ id: "b", label: "Enduure" });
	expect(widgetAccountInitials(sv, [sv, en], true)).toBe("SV");
	expect(widgetAccountInitials(en, [sv, en], true)).toBe("EN");
	const email = account({ label: "secret@example.test" });
	expect(widgetAccountInitials(email, [email], true)).toBe("1");
	const duplicates = Array.from({ length: 254 }, (_, i) =>
		account({ id: `id-${i}`, label: "Same Name" }),
	);
	expect(
		new Set(duplicates.map((a) => widgetAccountInitials(a, duplicates, true)))
			.size,
	).toBe(254);
	expect(widgetAccountInitials(duplicates[0], duplicates, true)).toBe(
		widgetAccountInitials(duplicates[0], [...duplicates].reverse(), true),
	);
});

test("edge attaches to physical screen with a right-side Dock and stays vertically centered", () => {
	const screen = { x: -1920, y: 0, width: 1920, height: 1080 };
	const work = { x: -1920, y: 30, width: 1840, height: 1050 };
	const anchor = { x: 0, y: 0, width: 1, height: 1 };
	const closed = panelBounds(work, anchor, "edge", false, 2, 548, screen);
	const open = panelBounds(work, anchor, "edge", true, 2, 548, screen);
	expect(closed.x + closed.width).toBe(0);
	expect(open.x + open.width).toBe(0);
	expect(closed.y + closed.height / 2).toBe(open.y + open.height / 2);
	expect(closed.height).toBe(166);
});

test("254 same-provider accounts stay distinct and searchable with stable private labels", () => {
	const accounts = Array.from({ length: 254 }, (_, i) =>
		account({
			id: `account-${i}`,
			label: `person${i}@example.test`,
			isDefault: i === 0,
			windows: [
				{
					id: "five_hour",
					label: "Session",
					usedPercent: i % 100,
					resetsAt: null,
				},
				{
					id: "seven_day",
					label: "Weekly",
					usedPercent: (i + 12) % 100,
					resetsAt: null,
				},
			],
		}),
	);
	const prefs = readWidgetPreferences({
		pinnedAccounts: { claude: "account-253" },
	});
	const groups = widgetAccountGroups(accounts, prefs, "", null);
	expect(groups[0].total).toBe(254);
	expect(new Set(groups[0].accounts.map((a) => a.account.id)).size).toBe(254);
	const found = widgetAccountGroups(accounts, prefs, "#254", "claude")[0];
	expect(found.total).toBe(254);
	expect(found.accounts).toHaveLength(1);
	expect(found.accounts[0].index).toBe(253);
	expect(found.accounts[0].selected).toBe(true);
	expect(
		selectedWindow(found.accounts[0].account, "session")?.usedPercent,
	).toBe(53);
	expect(selectedWindow(found.accounts[0].account, "weekly")?.usedPercent).toBe(
		65,
	);
	expect(
		widgetAccountGroups(accounts, prefs, "person253", "claude")[0].accounts,
	).toHaveLength(0);
	expect(
		widgetAccountGroups(
			accounts,
			{ ...prefs, hideEmails: false },
			"person253",
			"claude",
		)[0].accounts,
	).toHaveLength(1);
	expect(accounts[0].isDefault).toBe(true);
	expect(accounts[253].isDefault).toBe(false);
});

test("dial urgency has clear capacity bands, with the last ten percent red", () => {
	for (const used of [-10, 0, 15, 49]) expect(quotaColor(used)).toBe("#4ade80");
	for (const used of [50, 65, 74]) expect(quotaColor(used)).toBe("#facc15");
	for (const used of [75, 85, 89]) expect(quotaColor(used)).toBe("#fb923c");
	for (const used of [90, 91, 99, 100, 110])
		expect(quotaColor(used)).toBe("#ff4d5e");
});

test("exhaustion countdown follows the limiting window and never guesses from stale usage", () => {
	const later = now + 4 * 86400000;
	const a = account({
		windows: [
			{
				id: "five_hour",
				label: "Session",
				usedPercent: 100,
				resetsAt: new Date(now + 3600000).toISOString(),
			},
			{
				id: "seven_day",
				label: "Weekly",
				usedPercent: 100,
				resetsAt: new Date(later).toISOString(),
			},
		],
	});
	expect(exhaustedQuota(a, false, now)).toEqual({ resetsAt: later });
	expect(exhaustedQuota(a, true, now)).toBeNull();
	expect(exhaustedQuota(a, false, now + 7 * 60000)).toBeNull();
	expect(exhaustedQuota({ ...a, historical: true }, false, now)).toBeNull();
	expect(
		exhaustedQuota({ ...a, identityChanged: true }, false, now),
	).toBeNull();
	a.windows[1].resetsAt = null;
	expect(exhaustedQuota(a, false, now)).toEqual({ resetsAt: null });
	a.windows[0].usedPercent = 99.9;
	a.windows[1].usedPercent = 99.9;
	expect(exhaustedQuota(a, false, now)).toBeNull();
	a.windows[0].usedPercent = 100;
	a.windows[0].resetsAt = new Date(now).toISOString();
	expect(exhaustedQuota(a, false, now)).toBeNull();
});

test("a missing preferred session falls back to the reported weekly limit", () => {
	const weekly = {
		id: "primary",
		label: "Weekly",
		windowSeconds: 604800,
		usedPercent: 36,
		resetsAt: null,
	};
	const a = account({ provider: "codex", plan: "pro", windows: [weekly] });
	expect(preferredWindow(a, "session")).toBe(weekly);
	expect(displayWindows(a.windows)).toEqual([weekly]);
	expect(preferredWindow({ windows: [] }, "session")).toBeUndefined();
});
