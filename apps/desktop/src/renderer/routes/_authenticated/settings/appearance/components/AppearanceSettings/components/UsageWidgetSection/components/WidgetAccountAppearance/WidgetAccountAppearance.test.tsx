import { afterEach, expect, mock, test } from "bun:test";
import {
	readWidgetPreferences,
	type WidgetAccount,
} from "shared/usage-widget/model";

const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { WidgetAccountAppearance } = await import("./WidgetAccountAppearance");
afterEach(cleanup);

const accounts = Array.from(
	{ length: 20 },
	(_, index): WidgetAccount => ({
		id: `${index % 2 === 0 ? "claude" : "codex"}:${index.toString(16).padStart(64, "0")}`,
		quotaIdentity: index.toString(16).padStart(64, "0"),
		provider: index % 2 === 0 ? "claude" : "codex",
		label: `Studio ${index + 1}`,
		email: null,
		plan: null,
		isDefault: index === 0,
		status: "ok",
		identityChanged: false,
		billing: "subscription",
		historical: false,
		checkedAt: null,
		windows: [],
	}),
);

test("every account remains editable and hide actions target its exact identity", () => {
	const hide = mock((_id: string, _hidden: boolean) => Promise.resolve());
	const view = render(
		<WidgetAccountAppearance
			accounts={accounts}
			preferences={readWidgetPreferences({
				hiddenAccountIds: [accounts[19].id],
			})}
			dark
			saving={false}
			onColorChange={async () => {}}
			onHiddenChange={hide}
		/>,
	);
	expect(view.getAllByRole("listitem")).toHaveLength(20);
	expect(view.getAllByRole("button", { name: /Account color/ })).toHaveLength(
		20,
	);
	fireEvent.click(
		view.getByRole("button", { name: "Hide account · Studio 1" }),
	);
	fireEvent.click(
		view.getByRole("button", { name: "Show account · Studio 20" }),
	);
	expect(hide.mock.calls).toEqual([
		[accounts[0].id, true],
		[accounts[19].id, false],
	]);
	view.rerender(
		<WidgetAccountAppearance
			accounts={accounts}
			preferences={readWidgetPreferences({})}
			dark
			saving
			onColorChange={async () => {}}
			onHiddenChange={hide}
		/>,
	);
	expect(
		view
			.getAllByRole("button")
			.every((button) => (button as HTMLButtonElement).disabled),
	).toBe(true);
});

test("unverified Grok and Antigravity identities remain visible and hideable without an unusable color control", () => {
	const unverified = ["grok", "agy"].map((provider, index) => ({
		...accounts[index],
		id: `${provider}:unverified`,
		provider: provider as "grok" | "agy",
		quotaIdentity: undefined,
		label: provider,
	}));
	const hide = mock((_id: string, _hidden: boolean) => {});
	const view = render(
		<WidgetAccountAppearance
			accounts={unverified}
			preferences={readWidgetPreferences({})}
			dark
			saving={false}
			onColorChange={async () => {
				throw new Error("unverified appearance write");
			}}
			onHiddenChange={hide}
		/>,
	);
	expect(view.getAllByRole("listitem")).toHaveLength(2);
	expect(view.queryAllByRole("button", { name: /Account color/ })).toHaveLength(
		0,
	);
	fireEvent.click(view.getByRole("button", { name: "Hide account · grok" }));
	expect(hide.mock.calls).toEqual([["grok:unverified", true]]);
});
