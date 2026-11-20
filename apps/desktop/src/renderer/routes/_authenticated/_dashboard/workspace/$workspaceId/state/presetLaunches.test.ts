import { describe, expect, it, mock } from "bun:test";
import {
	afterPresetTerminalStart,
	runPresetOnce,
	startPresetTerminal,
} from "./presetLaunches";

describe("preset launches", () => {
	it("shares a pending launch for the same preset in the same workspace", async () => {
		const hold = Promise.withResolvers<void>();
		const start = mock(() => hold.promise);
		const independent = mock(async () => {});
		const first = runPresetOnce("workspace", "pi", start);
		expect(runPresetOnce("workspace", "pi", start)).toBe(first);
		await Promise.all([
			runPresetOnce("workspace", "codex", independent),
			runPresetOnce("another", "pi", independent),
		]);
		expect(start).toHaveBeenCalledTimes(1);
		expect(independent).toHaveBeenCalledTimes(2);
		hold.resolve();
		await first;
		await runPresetOnce("workspace", "pi", start);
		expect(start).toHaveBeenCalledTimes(2);
	});

	it("lets the user retry after a launch fails", async () => {
		const failed = runPresetOnce("ws", "codex", async () => {
			throw new Error("offline");
		});
		await expect(failed).rejects.toThrow("offline");
		const retry = mock(async () => {});
		await runPresetOnce("ws", "codex", retry);
		expect(retry).toHaveBeenCalledTimes(1);
	});

	it("waits for the pending terminal before running its cleanup", async () => {
		const hold = Promise.withResolvers<void>();
		const dispose = mock(() => {});
		const create = startPresetTerminal("new-id", () => hold.promise);
		afterPresetTerminalStart("new-id", dispose);
		expect(dispose).not.toHaveBeenCalled();
		hold.resolve();
		await create;
		expect(dispose).toHaveBeenCalledTimes(1);
	});
});
