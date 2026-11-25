import { afterEach, describe, expect, mock, test } from "bun:test";
import { createWorkspaceStore, Workspace } from "@superset/panes";
import { DropdownMenuItem } from "@superset/ui/dropdown-menu";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

afterEach(cleanup);

function renderWorkspace(
	onAddTab?: () => void,
	appearance: "cards" | "default" = "default",
) {
	const chooseTerminal = mock(() => {});
	render(
		<DndProvider backend={HTML5Backend}>
			<Workspace
				store={createWorkspaceStore()}
				registry={{}}
				appearance={appearance}
				onAddTab={onAddTab}
				renderAddTabMenu={({ runAfterClose }) => (
					<DropdownMenuItem onSelect={() => runAfterClose(chooseTerminal)}>
						Terminal
					</DropdownMenuItem>
				)}
			/>
		</DndProvider>,
	);
	return chooseTerminal;
}

describe("workspace new-tab controls", () => {
	for (const appearance of ["default", "cards"] as const) {
		test(`${appearance}: the default action and the full menu remain separate`, async () => {
			const openDefaultTab = mock(() => {});
			const chooseTerminal = renderWorkspace(openDefaultTab, appearance);
			const addButton = screen.getByRole("button", { name: "New tab" });
			fireEvent.pointerDown(addButton, { button: 0, ctrlKey: false });
			fireEvent.click(addButton);
			expect(openDefaultTab).toHaveBeenCalledTimes(1);
			expect(screen.queryByRole("menu")).toBeNull();

			fireEvent.keyDown(
				screen.getByRole("button", { name: "Choose tab type" }),
				{ key: "Enter" },
			);
			fireEvent.click(
				await screen.findByRole("menuitem", { name: "Terminal" }),
			);
			await waitFor(() => expect(chooseTerminal).toHaveBeenCalledTimes(1));
			expect(openDefaultTab).toHaveBeenCalledTimes(1);
		});
	}

	test("Ask keeps the chooser on the plus button", async () => {
		renderWorkspace();
		expect(
			screen.queryByRole("button", { name: "Choose tab type" }),
		).toBeNull();
		fireEvent.keyDown(screen.getByRole("button", { name: "New tab" }), {
			key: "Enter",
		});
		expect(
			await screen.findByRole("menuitem", { name: "Terminal" }),
		).toBeDefined();
	});
});
