import { describe, expect, test } from "bun:test";
import { MOVE_STOPPED_ANSWERING } from "../protocol";
import { keepMoveAlive } from "./keepMoveAlive";

const never = (signal: AbortSignal) =>
	new Promise<never>((_, reject) => {
		signal.addEventListener("abort", () => reject(signal.reason), {
			once: true,
		});
	});

describe("keepMoveAlive", () => {
	test("beats while the work runs and stops when it settles", async () => {
		const beats: string[] = [];
		const result = await keepMoveAlive({
			workspaceMoveId: "move-1",
			intervalMs: 5,
			heartbeat: async (id) => {
				beats.push(id);
				return { alive: true };
			},
			work: () =>
				new Promise<string>((resolve) => setTimeout(resolve, 30, "done")),
		});
		expect(result).toBe("done");
		const count = beats.length;
		expect(count).toBeGreaterThan(0);
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(beats.length).toBe(count);
	});

	test("ends the work with the sweep's reason when the move already ended", async () => {
		const seen: { signal: AbortSignal | null } = { signal: null };
		const run = keepMoveAlive({
			workspaceMoveId: "move-1",
			intervalMs: 5,
			heartbeat: async () => ({ alive: false }),
			work: (signal) => {
				seen.signal = signal;
				return new Promise<never>(() => {});
			},
		});
		await expect(run).rejects.toThrow(MOVE_STOPPED_ANSWERING);
		expect(seen.signal?.aborted).toBe(true);
	});

	test("ends the work with the reason the control plane gives", async () => {
		const run = keepMoveAlive({
			workspaceMoveId: "move-1",
			intervalMs: 5,
			heartbeat: async () => ({ alive: false, error: "Cancelled" }),
			work: () => new Promise<never>(() => {}),
		});
		await expect(run).rejects.toThrow("Cancelled");
	});

	test("keeps going when a beat cannot reach the control plane", async () => {
		const result = await keepMoveAlive({
			workspaceMoveId: "move-1",
			intervalMs: 5,
			heartbeat: async () => {
				throw new Error("fetch failed");
			},
			work: () => new Promise<number>((resolve) => setTimeout(resolve, 25, 7)),
		});
		expect(result).toBe(7);
	});

	test("passes the caller's cancel through to the work", async () => {
		const controller = new AbortController();
		const run = keepMoveAlive({
			workspaceMoveId: "move-1",
			intervalMs: 1_000,
			heartbeat: async () => ({ alive: true }),
			signal: controller.signal,
			work: never,
		});
		controller.abort(new DOMException("stopped", "AbortError"));
		await expect(run).rejects.toThrow("stopped");
	});
});
