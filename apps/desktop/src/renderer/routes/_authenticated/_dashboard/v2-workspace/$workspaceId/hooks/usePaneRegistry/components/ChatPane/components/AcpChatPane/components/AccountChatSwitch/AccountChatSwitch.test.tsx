import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import {
	AccountSwitchConfirmation,
	supportsAccountSwitch,
} from "./AccountChatSwitch";

afterEach(cleanup);

test("old hosts and unsupported harnesses do not expose a switch control", () => {
	expect(supportsAccountSwitch(undefined, "claude")).toBe(false);
	expect(supportsAccountSwitch({ harnesses: ["claude-acp"] }, "claude")).toBe(
		false,
	);
	expect(
		supportsAccountSwitch(
			{ accountSwitch: false, harnesses: ["claude-acp"] },
			"claude",
		),
	).toBe(false);
	expect(
		supportsAccountSwitch(
			{ accountSwitch: true, harnesses: ["codex-acp"] },
			"claude",
		),
	).toBe(false);
	expect(
		supportsAccountSwitch(
			{ accountSwitch: true, harnesses: ["claude-acp"] },
			"claude",
		),
	).toBe(true);
});

test("closing the idle source requires an explicit accessible consent", () => {
	const onChange = mock((_checked: boolean) => {});
	const view = render(
		<AccountSwitchConfirmation
			confirmed={false}
			switching={false}
			onChange={onChange}
		/>,
	);
	const checkbox = view.getByRole("checkbox", {
		name: /Close only this idle agent/,
	}) as HTMLInputElement;
	expect(checkbox.checked).toBe(false);
	fireEvent.click(checkbox);
	expect(onChange).toHaveBeenCalledWith(true);
	view.rerender(
		<AccountSwitchConfirmation confirmed switching onChange={onChange} />,
	);
	expect((view.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
});
