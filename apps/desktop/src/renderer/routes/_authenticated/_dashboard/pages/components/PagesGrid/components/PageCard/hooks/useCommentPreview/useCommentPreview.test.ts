import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useCommentPreview } = await import("./useCommentPreview");

const PANEL_ID = "comment-preview-panel";
const mouse = () => ({ pointerType: "mouse" }) as never;
const keyboardFocus = () => ({ target: { matches: () => true } }) as never;
const mouseFocus = () => ({ target: { matches: () => false } }) as never;

function setup() {
	const view = renderHook(() => useCommentPreview({ eligible: true }));
	const card = document.createElement("div");
	const count = document.createElement("a");
	count.tabIndex = 0;
	count.setAttribute("aria-describedby", PANEL_ID);
	const panel = document.createElement("a");
	panel.id = PANEL_ID;
	panel.tabIndex = 0;
	card.append(panel, count);
	document.body.append(card);
	view.result.current.cardRef.current = card;
	view.result.current.countRef.current = count;
	const blurTo = (next: Element | null) =>
		act(() =>
			view.result.current.cardProps.onBlur({
				relatedTarget: next,
				currentTarget: card,
			} as never),
		);
	return { ...view, card, count, panel, blurTo };
}

beforeEach(() => {
	jest.useFakeTimers();
});

afterEach(() => {
	cleanup();
	document.body.innerHTML = "";
	jest.useRealTimers();
});

describe("useCommentPreview", () => {
	test("hover opens after the intent delay, not before", () => {
		const { result } = setup();
		act(() => result.current.countProps.onPointerEnter(mouse()));
		act(() => jest.advanceTimersByTime(179));
		expect(result.current.open).toBe(false);
		act(() => jest.advanceTimersByTime(1));
		expect(result.current.open).toBe(true);
	});

	test("leaving the count before the delay never opens", () => {
		const { result } = setup();
		act(() => result.current.countProps.onPointerEnter(mouse()));
		act(() => result.current.countProps.onPointerLeave(mouse()));
		act(() => jest.advanceTimersByTime(500));
		expect(result.current.open).toBe(false);
	});

	test("the panel survives the trip from the count onto it", () => {
		const { result } = setup();
		act(() => result.current.countProps.onPointerEnter(mouse()));
		act(() => jest.advanceTimersByTime(180));
		act(() => result.current.countProps.onPointerLeave(mouse()));
		act(() => jest.advanceTimersByTime(299));
		expect(result.current.open).toBe(true);
		act(() => result.current.panelProps.onPointerEnter(mouse()));
		act(() => jest.advanceTimersByTime(1000));
		expect(result.current.open).toBe(true);
		act(() => result.current.panelProps.onPointerLeave(mouse()));
		act(() => jest.advanceTimersByTime(300));
		expect(result.current.open).toBe(false);
	});

	test("keyboard focus opens at once and mouse focus does not", () => {
		const { result } = setup();
		act(() => result.current.countProps.onFocus(mouseFocus()));
		expect(result.current.open).toBe(false);
		act(() => result.current.countProps.onFocus(keyboardFocus()));
		expect(result.current.open).toBe(true);
	});

	test("the pointer leaving does not hide a keyboard-focused panel", () => {
		const { result, blurTo, panel } = setup();
		act(() => result.current.countProps.onFocus(keyboardFocus()));
		act(() => result.current.cardProps.onPointerLeave(mouse()));
		expect(result.current.open).toBe(true);
		act(() => result.current.countProps.onPointerLeave(mouse()));
		act(() => jest.advanceTimersByTime(1000));
		expect(result.current.open).toBe(true);
		blurTo(panel);
		expect(result.current.open).toBe(true);
		blurTo(null);
		expect(result.current.open).toBe(false);
	});

	test("Escape closes and hands focus back to the count", () => {
		const { result, count } = setup();
		act(() => result.current.countProps.onFocus(keyboardFocus()));
		act(() =>
			result.current.cardProps.onKeyDown({
				key: "Escape",
				preventDefault() {},
			} as never),
		);
		expect(result.current.open).toBe(false);
		expect(document.activeElement).toBe(count);
		act(() => result.current.cardProps.onPointerLeave(mouse()));
		expect(result.current.open).toBe(false);
	});

	test("nothing opens without a comment to preview", () => {
		const { result } = renderHook(() => useCommentPreview({ eligible: false }));
		act(() => result.current.countProps.onPointerEnter(mouse()));
		act(() => jest.advanceTimersByTime(500));
		act(() => result.current.countProps.onFocus(keyboardFocus()));
		expect(result.current.open).toBe(false);
	});
});
