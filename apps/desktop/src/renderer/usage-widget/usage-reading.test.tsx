import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import {
	edgeHandleLayout,
	readWidgetPreferences,
	type WidgetAccount,
	type WidgetSnapshot,
} from "shared/usage-widget/model";

const { cleanup, render } = await import("@testing-library/react");
const { AccountRow } = await import("./components/AccountRow/AccountRow");
const { HoverPreview } = await import("./components/HoverPreview/HoverPreview");
const { EdgeHandle } = await import("./components/EdgeHandle/EdgeHandle");
const now = Date.parse("2026-10-14T07:00:00Z");
let restoreClock = () => {};
beforeEach(() => {
	const clock = spyOn(Date, "now").mockReturnValue(now);
	restoreClock = () => clock.mockRestore();
});
afterEach(() => {
	cleanup();
	restoreClock();
});

function fixture(overrides: Partial<WidgetAccount> = {}) {
	const account: WidgetAccount = {
		id: "fixture",
		provider: "claude",
		label: "Fixture Account",
		email: null,
		plan: "Max",
		isDefault: true,
		status: "unavailable",
		identityChanged: false,
		billing: "subscription",
		checkedAt: new Date(now - 30 * 60_000).toISOString(),
		historical: true,
		windows: [
			{
				id: "five_hour",
				label: "Session",
				usedPercent: 100,
				resetsAt: new Date(now - 1).toISOString(),
			},
			{
				id: "seven_day",
				label: "Weekly",
				usedPercent: 91,
				resetsAt: new Date(now + 60_000).toISOString(),
			},
		],
		resetCredits: {
			availableCount: 3,
			expirations: null,
			checkedAt: new Date(now).toISOString(),
		},
		...overrides,
	};
	const state: WidgetSnapshot = {
		preferences: readWidgetPreferences({ metric: "used" }),
		accounts: [account],
		hosts: [],
		hostId: "fixture-host",
		displays: [],
		loading: false,
		offline: false,
		locale: "en",
		dark: true,
		expanded: false,
		panelHeight: 548,
		edgeTransition: null,
		provider: null,
		surface: "edge",
	};
	return { account, state };
}

function renderSurfaces(overrides: Partial<WidgetAccount> = {}) {
	const { account, state } = fixture(overrides);
	return render(
		<>
			<AccountRow
				account={account}
				state={state}
				index={0}
				hidden={false}
				saving={false}
				onVisibilityChange={async () => {}}
			/>
			<HoverPreview state={state} accountId={account.id} />
			<EdgeHandle
				state={state}
				layout={edgeHandleLayout(1, { width: 800, height: 900 })}
			/>
		</>,
	);
}

test("expanded, hover and collapsed views retain the same historical values without live assertions", () => {
	const view = renderSurfaces();
	expect(view.getAllByText("~91%")).toHaveLength(2);
	expect(view.getAllByText("~100%")).toHaveLength(2);
	expect(view.getAllByText("Awaiting refresh")).toHaveLength(2);
	expect(view.getAllByText(/Last checked.*not live/)).toHaveLength(2);
	const button = view.getByRole("button", { name: /~100%.*~91%.*not live/ });
	expect(button.getAttribute("data-stale")).toBe("true");
	expect(button.getAttribute("data-exhausted")).toBe("false");
	expect(view.container.querySelectorAll(".usage-edge-stale")).toHaveLength(2);
	expect(
		view.container.querySelector(
			".usage-edge-critical, .usage-low, .usage-edge-reset, .usage-reset-credit",
		),
	).toBeNull();
});

test.each([
	{ identityChanged: true },
	{ checkedAt: new Date(now - 60 * 60_000 - 1).toISOString() },
])("all widget views suppress quarantined or expired history: %j", (overrides) => {
	const view = renderSurfaces(overrides);
	expect(view.queryByText(/~91%|~100%/)).toBeNull();
	expect(view.container.querySelectorAll("meter")).toHaveLength(0);
	expect(
		view.container.querySelector(".usage-edge-fill, .usage-edge-reset"),
	).toBeNull();
	const button = view.container.querySelector(".usage-edge-item");
	expect(button?.getAttribute("data-exhausted")).toBe("false");
	expect(button?.getAttribute("aria-label")).not.toContain("91%");
	if (overrides.identityChanged)
		expect(view.queryByText(/Last checked/)).toBeNull();
});

test("a fresh observation whose reset passed remains history only in every widget view", () => {
	const view = renderSurfaces({
		status: "ok",
		historical: false,
		checkedAt: new Date(now).toISOString(),
		resetCredits: undefined,
	});
	expect(view.getAllByText("~100%")).toHaveLength(2);
	expect(view.getAllByText("91%")).toHaveLength(2);
	expect(view.getAllByText("Awaiting refresh")).toHaveLength(2);
	const button = view.getByRole("button", { name: /~100%.*91%/ });
	expect(button.getAttribute("data-exhausted")).toBe("false");
	expect(view.container.querySelectorAll(".usage-edge-stale")).toHaveLength(1);
});

test.each([
	"primary",
	"secondary",
])("weekly-only Codex %s has no fabricated Session row or arc", (id) => {
	const view = renderSurfaces({
		provider: "codex",
		plan: "pro",
		status: "ok",
		historical: false,
		checkedAt: new Date(now).toISOString(),
		resetCredits: undefined,
		windows: [
			{
				id,
				label: "Weekly",
				windowSeconds: 604800,
				usedPercent: 36,
				resetsAt: new Date(now + 86400000).toISOString(),
			},
		],
	});
	expect(view.queryAllByText(/^Session/)).toHaveLength(0);
	expect(view.getAllByRole("meter", { name: "Weekly" })).toHaveLength(2);
	expect(view.getAllByText("36%")).toHaveLength(2);
	expect(view.container.querySelectorAll(".usage-edge-arc")).toHaveLength(1);
	expect(
		view.container.querySelector(".usage-edge-track")?.getAttribute("d"),
	).toBe("M18 2a16 16 0 1 1 0 32a16 16 0 1 1 0-32");
	const rail = view.container.querySelector(".usage-edge-item");
	expect(rail?.getAttribute("aria-label")).toContain("Weekly: 36%");
	expect(rail?.getAttribute("aria-label")).not.toContain("Session");
});

test("a returned five-hour and weekly limit keep two independent dials", () => {
	const view = renderSurfaces({
		provider: "codex",
		plan: "plus",
		status: "ok",
		historical: false,
		checkedAt: new Date(now).toISOString(),
		resetCredits: undefined,
		windows: [
			{
				id: "primary",
				label: "Session (5h)",
				windowSeconds: 18000,
				usedPercent: 24,
				resetsAt: null,
			},
			{
				id: "secondary",
				label: "Weekly",
				windowSeconds: 604800,
				usedPercent: 36,
				resetsAt: null,
			},
		],
	});
	expect(view.getAllByRole("meter")).toHaveLength(4);
	expect(view.container.querySelectorAll(".usage-edge-arc")).toHaveLength(2);
	const rail = view.container.querySelector(".usage-edge-item");
	expect(rail?.getAttribute("aria-label")).toContain("Session (5h): 24%");
	expect(rail?.getAttribute("aria-label")).toContain("Weekly: 36%");
});

test("unknown duration stays a generic provider limit in every widget surface", () => {
	const view = renderSurfaces({
		provider: "codex",
		status: "ok",
		historical: false,
		checkedAt: new Date(now).toISOString(),
		resetCredits: undefined,
		windows: [
			{ id: "primary", label: "Limit", usedPercent: 36, resetsAt: null },
		],
	});
	expect(view.getAllByRole("meter", { name: "Limit" })).toHaveLength(2);
	expect(view.queryAllByText(/^Session|^Weekly/)).toHaveLength(0);
	expect(
		view.container
			.querySelector(".usage-edge-item")
			?.getAttribute("aria-label"),
	).toContain("Limit: 36%");
});

test("missing quota is unavailable without inventing session or weekly windows", () => {
	const view = renderSurfaces({
		provider: "codex",
		plan: "pro",
		windows: [],
		resetCredits: undefined,
	});
	expect(view.queryAllByRole("meter")).toHaveLength(0);
	expect(view.queryAllByText(/^Session|^Weekly/)).toHaveLength(0);
	expect(view.container.querySelector(".usage-edge-fill")).toBeNull();
	expect(
		view.container
			.querySelector(".usage-edge-item")
			?.getAttribute("aria-label"),
	).not.toMatch(/Session|Weekly|Unlimited/);
});

test("panel, hover and rail share the same independently dated prepaid balance", () => {
	const view = renderSurfaces({
		prepaidBalance: {
			amount: 12.34,
			currency: "USD",
			checkedAt: new Date(now - 5 * 60_000).toISOString(),
		},
	});
	expect(view.getAllByText("$12.34")).toHaveLength(3);
	expect(view.getAllByText("Prepaid balance")).toHaveLength(2);
	expect(
		view.getByRole("button", { name: /Credit balance:.*12.34/ }),
	).toBeTruthy();
});
test("current quota cannot keep an expired wallet on any surface", () => {
	const view = renderSurfaces({
		status: "ok",
		historical: false,
		checkedAt: new Date(now).toISOString(),
		prepaidBalance: {
			amount: 45.67,
			currency: "EUR",
			checkedAt: new Date(now - 31 * 60_000 - 1).toISOString(),
		},
	});
	expect(view.queryByText(/45.67/)).toBeNull();
	expect(view.queryByText("Prepaid balance")).toBeNull();
});

test.each([
	"grok",
	"agy",
] as const)("expanded %s quota without a verified owner has no color write control", (provider) => {
	const { account, state } = fixture({
		provider,
		status: "ok",
		historical: false,
	});
	const view = render(
		<AccountRow
			account={account}
			state={state}
			index={0}
			hidden={false}
			saving={false}
			onVisibilityChange={async () => {}}
			onColorChange={async () => {
				throw new Error("unverified appearance write");
			}}
		/>,
	);
	expect(view.queryByRole("button", { name: /Account color/ })).toBeNull();
	expect(view.getByRole("button", { name: /Hide account/ })).toBeTruthy();
});

test("a verified account loses only its edit control during a transport outage, retaining its color", () => {
	const identity = "a".repeat(64);
	const { account, state } = fixture({
		id: `claude:${identity}`,
		quotaIdentity: identity,
		color: "#123456",
		status: "ok",
		historical: false,
	});
	const props = {
		account,
		state,
		index: 0,
		hidden: false,
		saving: false,
		onVisibilityChange: async () => {},
		onColorChange: async () => {},
	};
	const view = render(<AccountRow {...props} />);
	const originalIcon = view.container
		.querySelector("[style*=background-color]")
		?.getAttribute("style");
	expect(originalIcon).toBeTruthy();
	expect(view.getByRole("button", { name: /Account color/ })).toBeTruthy();
	view.rerender(<AccountRow {...props} state={{ ...state, offline: true }} />);
	expect(view.queryByRole("button", { name: /Account color/ })).toBeNull();
	expect(
		view.container
			.querySelector("[style*=background-color]")
			?.getAttribute("style"),
	).toBe(originalIcon);
});
