import { describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { useToolInstallState } from "./useToolInstallState";

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("useToolInstallState", () => {
	test("a brew install that prints no progress never counts as stalled", async () => {
		const { result } = renderHook(() => useToolInstallState(() => {}, 15));
		act(() => result.current.onData({ stage: "installing", untimed: true }));
		await act(() => tick(40));
		expect(result.current.state.stage).toBe("installing");

		act(() => result.current.onData({ stage: "verifying" }));
		await act(() => tick(40));
		expect(result.current.state).toMatchObject({
			stage: "failed",
			reason: "stalled",
		});
	});
});
