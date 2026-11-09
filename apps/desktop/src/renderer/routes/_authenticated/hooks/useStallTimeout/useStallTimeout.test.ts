import { describe, expect, mock, test } from "bun:test";
import { renderHook } from "@testing-library/react";
import { useStallTimeout } from "./useStallTimeout";

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("useStallTimeout", () => {
	test("fires only after no progress for the whole timeout", async () => {
		const onTimeout = mock(() => {});
		const { rerender, unmount } = renderHook(
			({ resetKey, active }) =>
				useStallTimeout({ active, resetKey, timeoutMs: 20, onTimeout }),
			{ initialProps: { resetKey: 0, active: true } },
		);
		await tick(12);
		rerender({ resetKey: 1, active: true });
		await tick(12);
		expect(onTimeout).not.toHaveBeenCalled();
		await tick(15);
		expect(onTimeout).toHaveBeenCalledTimes(1);

		rerender({ resetKey: 2, active: false });
		await tick(30);
		expect(onTimeout).toHaveBeenCalledTimes(1);
		unmount();
	});
});
