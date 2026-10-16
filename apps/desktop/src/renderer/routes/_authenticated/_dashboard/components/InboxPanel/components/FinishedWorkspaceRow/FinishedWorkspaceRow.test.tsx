import { describe, expect, mock, test } from "bun:test";
import { stripeTestKit } from "renderer/routes/_authenticated/_dashboard/inbox/$cardId/components/InboxDocument/components/CardBlock/components/stripeTestKit";

const { act, fireEvent, render, TooltipProvider } = await stripeTestKit();
const { useHotkeyScopeStore } = await import("renderer/hotkeys");
const { FinishedWorkspaceRow } = await import("./FinishedWorkspaceRow");

const now = new Date("2037-10-01T19:00:00Z");
function mount(props: { selected?: boolean; note?: string } = {}) {
	const onOpen = mock();
	const onDismiss = mock();
	const view = render(
		<TooltipProvider>
			<FinishedWorkspaceRow
				itemId="finished-w1"
				selected={props.selected ?? false}
				workspaceName="Wave map"
				finishedAt={new Date("2037-10-01T18:15:00Z")}
				now={now}
				note={props.note}
				onOpen={onOpen}
				onDismiss={onDismiss}
			/>
		</TooltipProvider>,
	);
	return { ...view, onOpen, onDismiss, row: view.getByRole("article") };
}

describe("a finished workspace as an inbox card", () => {
	test("the workspace name is the title, with Agent finished and the time; there is no Open button and no nested row", () => {
		const view = mount();
		expect(view.row.textContent).toContain("Wave map");
		expect(view.row.textContent).toContain("Agent finished");
		expect(view.row.textContent).toContain("45m");
		expect(view.queryByRole("button", { name: /Open/ })).toBeNull();
		expect(view.row.querySelectorAll("article").length).toBe(0);
	});

	test("what the agent wrote, when it pushed a card, is the card's second line", () => {
		const view = mount({ note: "The legend now passes contrast" });
		expect(view.getByText("The legend now passes contrast")).toBeTruthy();
	});

	test("a click anywhere on the card opens it; Dismiss dismisses and does not open", async () => {
		const view = mount();
		await act(async () => {
			fireEvent.click(view.row);
		});
		expect(view.onOpen).toHaveBeenCalledTimes(1);
		await act(async () => {
			fireEvent.click(view.getByRole("button", { name: "Dismiss" }));
		});
		expect(view.onDismiss).toHaveBeenCalledTimes(1);
		expect(view.onOpen).toHaveBeenCalledTimes(1);
	});

	test("the selected card is marked as current and is the one in the tab order", () => {
		const selected = mount({ selected: true });
		expect(selected.row.getAttribute("aria-current")).toBe("true");
		expect(selected.row.tabIndex).toBe(0);
		selected.unmount();
		const other = mount();
		expect(other.row.getAttribute("aria-current")).toBeNull();
		expect(other.row.tabIndex).toBe(-1);
	});

	test("the selected card takes focus while the inbox holds the focus scope, and leaves focus alone otherwise", () => {
		useHotkeyScopeStore.setState({ active: "inbox" });
		const inScope = mount({ selected: true });
		expect(document.activeElement).toBe(inScope.row);
		inScope.unmount();
		useHotkeyScopeStore.setState({ active: null });
		const outOfScope = mount({ selected: true });
		expect(document.activeElement).not.toBe(outOfScope.row);
	});
});
