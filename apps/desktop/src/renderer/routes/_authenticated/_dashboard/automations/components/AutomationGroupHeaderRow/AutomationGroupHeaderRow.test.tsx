import { afterEach, describe, expect, mock, test } from "bun:test";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, screen } = await import(
	"@testing-library/react"
);
const { createElement } = await import("react");
const { AutomationGroupHeaderRow } = await import("./AutomationGroupHeaderRow");

afterEach(cleanup);

const renderHeader = (props: {
	group: string | null;
	onDeleteGroup?: () => void;
}) =>
	render(
		createElement(
			"table",
			null,
			createElement(
				"tbody",
				null,
				createElement(AutomationGroupHeaderRow, {
					count: 2,
					collapsed: false,
					columnCount: 5,
					onToggle: () => {},
					...props,
				}),
			),
		),
	);

describe("AutomationGroupHeaderRow", () => {
	test("right-click offers Delete group, which calls back", async () => {
		const onDeleteGroup = mock(() => {});
		renderHeader({ group: "Growth", onDeleteGroup });

		await act(async () => {
			fireEvent.contextMenu(screen.getByText("Growth"));
		});
		const item = await screen.findByText("Delete group…");
		await act(async () => {
			fireEvent.click(item);
		});

		expect(onDeleteGroup).toHaveBeenCalledTimes(1);
	});

	test("No group has no menu", async () => {
		renderHeader({ group: null, onDeleteGroup: () => {} });
		await act(async () => {
			fireEvent.contextMenu(screen.getByText("No group"));
		});
		expect(screen.queryByText("Delete group…")).toBeNull();
	});
});
