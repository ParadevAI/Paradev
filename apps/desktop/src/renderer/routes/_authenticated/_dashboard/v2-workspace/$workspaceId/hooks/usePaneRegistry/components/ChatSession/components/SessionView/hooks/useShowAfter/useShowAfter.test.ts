import { expect, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useShowAfter } from "./useShowAfter";

test("stays hidden for a short hold and shows once the hold outlasts the delay", async () => {
	const { result, rerender } = renderHook(
		({ active }) => useShowAfter(active, 20),
		{ initialProps: { active: true } },
	);
	expect(result.current).toBe(false);
	await waitFor(() => expect(result.current).toBe(true));

	rerender({ active: false });
	expect(result.current).toBe(false);

	rerender({ active: true });
	expect(result.current).toBe(false);
	await act(() => new Promise((done) => setTimeout(done, 5)));
	rerender({ active: false });
	await act(() => new Promise((done) => setTimeout(done, 30)));
	expect(result.current).toBe(false);
});

test("a zero delay shows the notice on the first render", () => {
	const { result } = renderHook(() => useShowAfter(true, 0));
	expect(result.current).toBe(true);
});
