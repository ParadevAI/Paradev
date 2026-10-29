import { afterEach, describe, expect, test } from "bun:test";
import { useWorkspaceSidebarStore } from "renderer/stores/workspace-sidebar-state";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, render } = await import("@testing-library/react");
const { WorkspaceSidebarPanel } = await import("./WorkspaceSidebarPanel");

const initialInnerWidth = window.innerWidth;
const initialStore = useWorkspaceSidebarStore.getState();

const resizeWindow = (width: number) =>
	act(() => {
		Object.defineProperty(window, "innerWidth", {
			configurable: true,
			value: width,
		});
		window.dispatchEvent(new Event("resize"));
	});

afterEach(() => {
	cleanup();
	Object.defineProperty(window, "innerWidth", {
		configurable: true,
		value: initialInnerWidth,
	});
	useWorkspaceSidebarStore.setState({
		width: initialStore.width,
		lastExpandedWidth: initialStore.lastExpandedWidth,
	});
});

function renderPanel() {
	const result = render(
		<WorkspaceSidebarPanel>
			<div data-testid="sidebar">sidebar</div>
		</WorkspaceSidebarPanel>,
	);
	return () =>
		(result.getByTestId("sidebar").parentElement as HTMLElement).style.width;
}

describe("WorkspaceSidebarPanel", () => {
	test("narrows to leave room for the right pane, re-clamped on window resize, without rewriting the saved width", async () => {
		useWorkspaceSidebarStore.getState().setWidth(400);
		await resizeWindow(1728);
		const shownWidth = renderPanel();
		expect(shownWidth()).toBe("400px");
		await resizeWindow(560);
		expect(shownWidth()).toBe(`${560 - 262}px`);
		expect(useWorkspaceSidebarStore.getState().width).toBe(400);
		await resizeWindow(1728);
		expect(shownWidth()).toBe("400px");
	});

	test("keeps the collapsed rail at any window width", async () => {
		useWorkspaceSidebarStore.getState().setWidth(0);
		await resizeWindow(400);
		expect(renderPanel()()).toBe("52px");
	});
});
