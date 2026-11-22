import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { PointerEvent } from "react";
import { useHoverCardSafeTriangle } from "./useHoverCardSafeTriangle";

afterEach(cleanup);

function setup() {
	const onOpenChange = mock((_open: boolean) => {});
	const { result } = renderHook(() =>
		useHoverCardSafeTriangle(true, onOpenChange),
	);
	const card = document.createElement("div");
	card.setAttribute("data-side", "right");
	card.getBoundingClientRect = () =>
		({ left: 100, right: 300, top: 0, bottom: 200 }) as DOMRect;
	act(() => {
		result.current.setCardElement(card);
		result.current.onTriggerPointerLeave({
			clientX: 80,
			clientY: 10,
		} as PointerEvent);
		result.current.onOpenChange(false);
	});
	const moveTo = (x: number, y: number) =>
		act(() => {
			document.dispatchEvent(
				new MouseEvent("mousemove", { clientX: x, clientY: y }),
			);
		});
	return { result, onOpenChange, moveTo };
}

describe("useHoverCardSafeTriangle", () => {
	test("holds the close while the pointer moves toward the card", () => {
		const { onOpenChange, moveTo } = setup();
		moveTo(90, 40);
		expect(onOpenChange).not.toHaveBeenCalled();
	});

	test("closes once the pointer leaves the triangle", () => {
		const { onOpenChange, moveTo } = setup();
		moveTo(90, 40);
		moveTo(60, 150);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});
