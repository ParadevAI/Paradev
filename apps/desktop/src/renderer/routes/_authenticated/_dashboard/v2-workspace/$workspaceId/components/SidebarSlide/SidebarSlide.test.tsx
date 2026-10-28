import { afterEach, describe, expect, test } from "bun:test";
import type { SidebarSlideMode } from "./SidebarSlide";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, render } = await import("@testing-library/react");
const { SidebarSlide } = await import("./SidebarSlide");

afterEach(cleanup);

const settle = () =>
	act(() => new Promise<void>((resolve) => setTimeout(resolve, 40)));

function renderSlide(mode: SidebarSlideMode, keepMounted = false) {
	const fills: boolean[] = [];
	const ui = (next: SidebarSlideMode) => (
		<SidebarSlide
			mode={next}
			width={300}
			keepMounted={keepMounted}
			durationMs={1}
		>
			{(fill) => {
				fills.push(fill);
				return <div data-testid="panel">panel</div>;
			}}
		</SidebarSlide>
	);
	const result = render(ui(mode));
	return {
		...result,
		fills,
		setMode: (next: SidebarSlideMode) => result.rerender(ui(next)),
		panel: () => result.queryByTestId("panel"),
	};
}

describe("SidebarSlide", () => {
	test("expanding and restoring keep the same panel node, filling while expanded", async () => {
		const slide = renderSlide("open");
		const node = slide.panel();
		slide.setMode("expanded");
		await settle();
		expect(slide.panel()).toBe(node);
		expect(slide.fills.at(-1)).toBe(true);
		slide.setMode("open");
		await settle();
		expect(slide.panel()).toBe(node);
		expect(slide.fills.at(-1)).toBe(false);
	});

	test("expanded takes the parent's full width in flow, from closed and from open", async () => {
		for (const from of ["closed", "open"] as const) {
			const slide = renderSlide(from, true);
			slide.setMode("expanded");
			const space = slide.panel()?.parentElement?.parentElement
				?.parentElement as HTMLElement;
			expect(space.style.transitionProperty).toBe("width");
			await settle();
			expect(space.style.width).toBe("100%");
			expect(space.className).toContain("shrink-0");
			expect(space.firstElementChild?.className).toContain("inset-0");
			slide.setMode(from);
			await settle();
			expect(space.style.width).toBe(from === "closed" ? "0px" : "");
			slide.unmount();
		}
	});

	test("mounts the panel only once opened and unmounts it on close unless kept", async () => {
		expect(renderSlide("closed").panel()).toBeNull();
		const slide = renderSlide("open");
		slide.setMode("closed");
		await settle();
		expect(slide.panel()).toBeNull();
	});

	test("a kept panel survives close and reopen, hidden and inert while closed", async () => {
		const slide = renderSlide("open", true);
		const node = slide.panel();
		slide.setMode("closed");
		await settle();
		const content = node?.parentElement;
		expect(slide.panel()).toBe(node);
		expect(content?.hasAttribute("inert")).toBe(true);
		expect(content?.className).toContain("invisible");
		slide.setMode("open");
		await settle();
		expect(slide.panel()).toBe(node);
		expect(content?.hasAttribute("inert")).toBe(false);
	});

	test("settles on the last mode when toggled mid-move", async () => {
		const slide = renderSlide("open", true);
		slide.setMode("closed");
		slide.setMode("open");
		slide.setMode("closed");
		await settle();
		expect(slide.panel()?.parentElement?.hasAttribute("inert")).toBe(true);
	});
});
