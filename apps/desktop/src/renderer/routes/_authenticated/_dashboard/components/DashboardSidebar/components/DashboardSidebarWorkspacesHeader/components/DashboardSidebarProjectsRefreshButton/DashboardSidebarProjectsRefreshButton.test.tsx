import { afterEach, expect, it, mock } from "bun:test";
import { TooltipProvider } from "@superset/ui/tooltip";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { useSidebarSectionsCollapseStore } from "renderer/stores/sidebar-sections-collapse";
import { DashboardSidebarSectionHeader } from "../../../DashboardSidebarSectionHeader";
import { DashboardSidebarProjectsRefreshButton } from "./DashboardSidebarProjectsRefreshButton";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const initialCollapsed = useSidebarSectionsCollapseStore.getState().collapsed;
afterEach(() => {
	cleanup();
	useSidebarSectionsCollapseStore.setState({ collapsed: initialCollapsed });
});

it("refreshes once while pending without toggling the enclosing section", async () => {
	const pending = Promise.withResolvers<void>();
	const onRefresh = mock(() => pending.promise);
	render(
		<TooltipProvider>
			<DashboardSidebarSectionHeader label="Projects" section="workspaces">
				<DashboardSidebarProjectsRefreshButton onRefresh={onRefresh} />
			</DashboardSidebarSectionHeader>
		</TooltipProvider>,
	);
	const button = screen.getByRole("button", {
		name: "Refresh",
	}) as HTMLButtonElement;
	fireEvent.keyDown(button, { key: "Enter" });
	fireEvent.click(button);
	expect(button.disabled).toBe(true);
	expect(button.getAttribute("aria-busy")).toBe("true");
	fireEvent.click(button);
	expect(onRefresh).toHaveBeenCalledTimes(1);
	expect(useSidebarSectionsCollapseStore.getState().collapsed.workspaces).toBe(
		false,
	);
	await act(async () => {
		pending.resolve();
		await pending.promise;
	});
	expect(button.disabled).toBe(false);
	expect(button.getAttribute("aria-busy")).toBe("false");
	fireEvent.click(screen.getByRole("button", { name: "Projects" }));
	expect(useSidebarSectionsCollapseStore.getState().collapsed.workspaces).toBe(
		true,
	);
});

it("allows retrying after a failed refresh", async () => {
	const onRefresh = mock(async () => {
		throw new Error("Host unavailable");
	});
	render(
		<TooltipProvider>
			<DashboardSidebarProjectsRefreshButton onRefresh={onRefresh} />
		</TooltipProvider>,
	);
	const button = screen.getByRole("button", {
		name: "Refresh",
	}) as HTMLButtonElement;
	await act(async () => {
		fireEvent.click(button);
	});
	expect(button.disabled).toBe(false);
	await act(async () => {
		fireEvent.click(button);
	});
	expect(onRefresh).toHaveBeenCalledTimes(2);
});
