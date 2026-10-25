import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { createPortal } from "react-dom";
import { DashboardSidebarRowEventBoundary } from "./DashboardSidebarRowEventBoundary";

afterEach(cleanup);

function setup() {
	const dragStart = mock(() => {});
	const rowClick = mock(() => {});
	const view = render(
		// biome-ignore lint/a11y/useSemanticElements: mirrors the sortable row, which contains nested buttons
		<div
			role="button"
			tabIndex={0}
			onMouseDown={dragStart}
			onTouchStart={dragStart}
			onClick={rowClick}
			onKeyDown={rowClick}
		>
			<DashboardSidebarRowEventBoundary>
				<button type="button">
					Ports
					{createPortal(<span>Port details</span>, document.body)}
				</button>
			</DashboardSidebarRowEventBoundary>
		</div>,
	);
	return { ...view, dragStart, rowClick };
}

describe("DashboardSidebarRowEventBoundary", () => {
	for (const eventType of ["mouseDown", "touchStart"] as const) {
		for (const label of ["Ports", "Port details"]) {
			test(`${eventType} on ${label} does not start a row drag`, () => {
				const { getByText, dragStart } = setup();
				fireEvent[eventType](getByText(label));
				expect(dragStart).not.toHaveBeenCalled();
			});
		}
	}

	test("clicks and keys inside the portaled card do not activate the row", () => {
		const { getByText, rowClick } = setup();
		fireEvent.click(getByText("Port details"));
		fireEvent.keyDown(getByText("Port details"), { key: "Enter" });
		expect(rowClick).not.toHaveBeenCalled();
	});
});
