import { afterEach, expect, test } from "bun:test";
import { DropdownMenuItem } from "@superset/ui/dropdown-menu";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useRef, useState } from "react";
import { PaneTitleMenu } from "./PaneTitleMenu";

afterEach(cleanup);

function Title() {
	const [open, setOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	return (
		<PaneTitleMenu
			open={open}
			onOpenChange={setOpen}
			triggerRef={triggerRef}
			renderTrigger={(props) => <button {...props}>Chat</button>}
		>
			<DropdownMenuItem>Fork</DropdownMenuItem>
		</PaneTitleMenu>
	);
}

test("a press on the title does not open the menu, so the pane can still be dragged", () => {
	const view = render(<Title />);
	fireEvent.pointerDown(view.getByRole("button", { name: "Chat" }), {
		button: 0,
	});
	expect(view.queryByRole("menu")).toBeNull();
});

test("a click on the title toggles the menu", () => {
	const view = render(<Title />);
	const title = view.getByRole("button", { name: "Chat" });
	fireEvent.click(title);
	expect(view.getByRole("menu")).toBeTruthy();
	expect(title.getAttribute("aria-expanded")).toBe("true");
	fireEvent.pointerDown(title, { button: 0 });
	fireEvent.click(title);
	expect(view.queryByRole("menu")).toBeNull();
});
