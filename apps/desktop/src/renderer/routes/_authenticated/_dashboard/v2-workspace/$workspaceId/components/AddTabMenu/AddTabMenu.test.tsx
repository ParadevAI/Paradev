import { afterEach, expect, mock, test } from "bun:test";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { AddTabMenu } from "./AddTabMenu";

afterEach(cleanup);

test("keeps upstream chat actions and defers the account dialog until the menu closes", () => {
	let afterClose: (() => void) | undefined;
	const onAddAccountTerminal = mock((_returnFocus: HTMLElement | null) => {});
	const onAddChat = mock(() => {});
	const view = render(
		<DropdownMenu open modal={false}>
			<DropdownMenuTrigger>Add</DropdownMenuTrigger>
			<DropdownMenuContent>
				<AddTabMenu
					onAddTerminal={() => {}}
					onAddAccountTerminal={onAddAccountTerminal}
					onAddChat={onAddChat}
					runAfterClose={(action) => {
						afterClose = action;
					}}
					showPresetsBar
					onToggleShowPresetsBar={() => {}}
				/>
			</DropdownMenuContent>
		</DropdownMenu>,
	);
	expect(view.getByRole("menuitem", { name: /Chat/ })).toBeTruthy();
	fireEvent.click(
		view.getByRole("menuitem", { name: "Agent terminal with account…" }),
	);
	expect(onAddAccountTerminal).not.toHaveBeenCalled();
	expect(afterClose).toBeDefined();
	afterClose?.();
	expect(onAddAccountTerminal.mock.calls).toHaveLength(1);
	expect(onAddAccountTerminal.mock.calls[0]?.[0]).toBe(view.getByText("Add"));
	expect(onAddChat).not.toHaveBeenCalled();
});
