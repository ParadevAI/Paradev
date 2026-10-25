import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { AddTabMenu } from "./AddTabMenu";

afterEach(cleanup);

test("keeps upstream chat actions and defers the account dialog until the menu closes", () => {
	let afterClose: (() => void) | undefined;
	const onAddAccountTerminal = mock(() => {});
	const onAddChat = mock(() => {});
	const view = render(
		<DropdownMenu open modal={false}>
			<DropdownMenuTrigger id="account-launch-trigger">Add</DropdownMenuTrigger>
			<DropdownMenuContent>
				<AddTabMenu
					onAddTerminal={() => {}}
					onAddAccountTerminal={onAddAccountTerminal}
					onAddChat={onAddChat}
					runAfterClose={(action) => { afterClose = action; }}
					showPresetsBar
					onToggleShowPresetsBar={() => {}}
				/>
			</DropdownMenuContent>
		</DropdownMenu>,
	);
	expect(view.getByRole("menuitem", { name: /Chat/ })).toBeTruthy();
	fireEvent.click(view.getByRole("menuitem", { name: "Agent terminal with account…" }));
	expect(onAddAccountTerminal).not.toHaveBeenCalled();
	expect(afterClose).toBeDefined();
	afterClose?.();
	expect(onAddAccountTerminal).toHaveBeenCalledWith(view.getByText("Add"));
	expect(onAddChat).not.toHaveBeenCalled();
});
