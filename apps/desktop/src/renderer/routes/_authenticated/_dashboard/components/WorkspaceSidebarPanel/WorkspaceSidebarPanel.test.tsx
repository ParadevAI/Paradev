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
		autoCollapsed: false,
		adjustedThisSession: false,
	});
});

function renderPanel(collapsedWidth?: number) {
	const result = render(
		<WorkspaceSidebarPanel collapsedWidth={collapsedWidth}>
			<div data-testid="sidebar">sidebar</div>
		</WorkspaceSidebarPanel>,
	);
	return () =>
		(result.getByTestId("sidebar").parentElement as HTMLElement).style.width;
}

describe("WorkspaceSidebarPanel", () => {
	test("folds to the rail when the window gets too narrow, and unfolds on the way back", async () => {
		useWorkspaceSidebarStore.setState({ width: 280, lastExpandedWidth: 280 });
		await resizeWindow(1728);
		const shownWidth = renderPanel();
		expect(shownWidth()).toBe("280px");
		await resizeWindow(760);
		expect(shownWidth()).toBe("52px");
		await resizeWindow(1728);
		expect(shownWidth()).toBe("280px");
	});

	test("a drag on the folded rail that changes nothing still unfolds on the way back", async () => {
		useWorkspaceSidebarStore.setState({ width: 280, lastExpandedWidth: 280 });
		await resizeWindow(1728);
		const shownWidth = renderPanel();
		await resizeWindow(760);
		await act(() => useWorkspaceSidebarStore.getState().setWidth(40));
		await resizeWindow(1728);
		expect(shownWidth()).toBe("280px");
	});

	test("starts folded when the window opens too narrow", async () => {
		useWorkspaceSidebarStore.setState({ width: 280, lastExpandedWidth: 280 });
		await resizeWindow(700);
		expect(renderPanel()()).toBe("52px");
	});

	test("keeps a sidebar the user folded by hand folded after the window widens", async () => {
		useWorkspaceSidebarStore.getState().setWidth(280);
		await resizeWindow(1728);
		const shownWidth = renderPanel();
		await act(() => useWorkspaceSidebarStore.getState().toggleCollapsed());
		await resizeWindow(700);
		await resizeWindow(1728);
		expect(shownWidth()).toBe("52px");
	});

	test("a sidebar opened by hand in a narrow window leaves room for the center and right panes without rewriting the saved width", async () => {
		useWorkspaceSidebarStore.setState({ width: 400, lastExpandedWidth: 400 });
		await resizeWindow(1728);
		const shownWidth = renderPanel();
		await resizeWindow(760);
		expect(shownWidth()).toBe("52px");
		await act(() => useWorkspaceSidebarStore.getState().toggleCollapsed());
		expect(shownWidth()).toBe(`${760 - 260 - 262}px`);
		expect(useWorkspaceSidebarStore.getState().width).toBe(400);
		await resizeWindow(640);
		expect(shownWidth()).toBe("225px");
		await resizeWindow(1728);
		expect(shownWidth()).toBe("400px");
		await resizeWindow(900);
		expect(shownWidth()).toBe(`${900 - 260 - 262}px`);
	});

	test("stops folding for the rest of the session once the user toggles it", async () => {
		await resizeWindow(1728);
		useWorkspaceSidebarStore.setState({ width: 280, lastExpandedWidth: 280 });
		const shownWidth = renderPanel();
		await act(() => useWorkspaceSidebarStore.getState().toggleCollapsed());
		await act(() => useWorkspaceSidebarStore.getState().toggleCollapsed());
		await resizeWindow(700);
		expect(shownWidth()).toBe("225px");
	});

	test("keeps the collapsed rail at any window width", async () => {
		useWorkspaceSidebarStore.getState().setWidth(0);
		await resizeWindow(400);
		expect(renderPanel()()).toBe("52px");
	});

	test("beside a separate rail, collapsing hides the panel entirely", async () => {
		useWorkspaceSidebarStore.getState().setWidth(0);
		expect(renderPanel(0)()).toBe("0px");
		expect(useWorkspaceSidebarStore.getState().isCollapsed()).toBe(true);
	});
});
