import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { SubagentBreadcrumb } from "./SubagentBreadcrumb";

afterEach(cleanup);

const path = [
	{ id: "subagent:c1", title: "Explore" },
	{ id: "subagent:c2", title: "Nested" },
];

function renderBreadcrumb() {
	const onSelect = mock((_id: string | null) => {});
	const onHeaderClick = mock(() => {});
	const view = render(
		// biome-ignore lint/a11y/useKeyWithClickEvents: stands in for the pane header
		// biome-ignore lint/a11y/noStaticElementInteractions: stands in for the pane header
		<div onClick={onHeaderClick}>
			<SubagentBreadcrumb
				onSelect={onSelect}
				path={path}
				root={<button type="button">Chat</button>}
			/>
		</div>,
	);
	return { view, onSelect, onHeaderClick };
}

test("the root segment is the given element and does not navigate", () => {
	const { view, onSelect, onHeaderClick } = renderBreadcrumb();
	fireEvent.click(view.getByRole("button", { name: "Chat" }));
	expect(onSelect).not.toHaveBeenCalled();
	expect(onHeaderClick).not.toHaveBeenCalled();
});

test("selecting a parent subagent goes up one level", () => {
	const { view, onSelect } = renderBreadcrumb();
	fireEvent.click(view.getByRole("button", { name: "Explore" }));
	expect(onSelect).toHaveBeenCalledWith("subagent:c1");
	expect(view.queryByRole("button", { name: "Nested" })).toBeNull();
});
