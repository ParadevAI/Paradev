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
		id: `account-${index}`,
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
			preferences={readWidgetPreferences({ hiddenAccountIds: ["account-19"] })}
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
		["account-0", true],
		["account-19", false],
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
