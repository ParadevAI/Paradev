import { afterEach, describe, expect, test } from "bun:test";
import type { SidebarSlideMode } from "../SidebarSlide";
import type { PaneArea } from "./WorkspaceSplitLayout";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render } = await import(
	"@testing-library/react"
);
const { WorkspaceSplitLayout } = await import("./WorkspaceSplitLayout");

afterEach(cleanup);

const settle = () =>
	act(() => new Promise<void>((resolve) => setTimeout(resolve, 40)));

function renderLayout(initial: SidebarSlideMode) {
	const activeAreaRef: { current: PaneArea } = { current: "center" };
	const ui = (next: SidebarSlideMode) => (
		<WorkspaceSplitLayout
			mode={next}
			activeAreaRef={activeAreaRef}
			width={300}
			minWidth={200}
			maxWidth={Number.POSITIVE_INFINITY}
			defaultWidth={() => 300}
			onWidthChange={() => {}}
			onResizingChange={() => {}}
			keepMounted
			durationMs={1}
			side={
				<div data-pane-area="right">
					<button type="button" data-testid="side">
						side
					</button>
				</div>
			}
		>
			<div data-pane-area="center">
				<button type="button" data-testid="center">
					center
				</button>
			</div>
		</WorkspaceSplitLayout>
	);
	const result = render(ui(initial));
	return {
		...result,
		activeAreaRef,
		center: () =>
			result.getByTestId("center").parentElement?.parentElement as HTMLElement,
		setMode: (next: SidebarSlideMode) => result.rerender(ui(next)),
	};
}

describe("WorkspaceSplitLayout", () => {
	test("the center has no hard minimum, so it can yield all its width", () => {
		const center = renderLayout("open").center();
		expect(center.className).toContain("min-w-0");
		expect(center.className).toContain("flex-1");
		expect(center.style.minWidth).toBe("");
	});

	test("the center stays mounted and is inert only while expanded", async () => {
		for (const from of ["closed", "open"] as const) {
			const layout = renderLayout(from);
			const node = layout.getByTestId("center");
			layout.setMode("expanded");
			expect(layout.center().hasAttribute("inert")).toBe(true);
			await settle();
			layout.setMode(from);
			expect(layout.center().hasAttribute("inert")).toBe(false);
			await settle();
			expect(layout.getByTestId("center")).toBe(node);
			layout.unmount();
		}
	});

	test("the area that last got a pointer or focus is the active one", () => {
		const layout = renderLayout("open");
		fireEvent.pointerDown(layout.getByTestId("side"));
		expect(layout.activeAreaRef.current).toBe("right");
		act(() => layout.getByTestId("center").focus());
		expect(layout.activeAreaRef.current).toBe("center");
		fireEvent.pointerDown(layout.center());
		expect(layout.activeAreaRef.current).toBe("center");
	});

	test("a window blur keeps the area that holds focus", () => {
		const layout = renderLayout("open");
		act(() => layout.getByTestId("side").focus());
		layout.activeAreaRef.current = "center";
		window.dispatchEvent(new Event("blur"));
		expect<PaneArea>(layout.activeAreaRef.current).toBe("right");
	});

	test("entering expanded makes the right area active", () => {
		const layout = renderLayout("open");
		layout.setMode("expanded");
		expect(layout.activeAreaRef.current).toBe("right");
	});
});
