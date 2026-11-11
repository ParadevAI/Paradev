import { describe, expect, test } from "bun:test";
import { createSingleInstall } from "./single-install";

function deferred() {
	let resolve: () => void = () => {};
	const promise = new Promise<void>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

describe("createSingleInstall", () => {
	test("a second caller joins the running install instead of starting another", async () => {
		const subscribe = createSingleInstall<string>();
		const gate = deferred();
		let starts = 0;
		const start = async (emit: (event: string) => void) => {
			starts++;
			emit("downloading");
			await gate.promise;
			return "done";
		};
		const first: string[] = [];
		const second: string[] = [];
		subscribe("gh", start, (event) => first.push(event));
		await Promise.resolve();
		await Promise.resolve();
		subscribe("gh", start, (event) => second.push(event));
		gate.resolve();
		await new Promise((r) => setTimeout(r, 0));

		expect(starts).toBe(1);
		expect(first).toEqual(["downloading", "done"]);
		expect(second).toEqual(["downloading", "done"]);
	});

	test("cancels only when every caller has left, and a later caller waits for it to stop", async () => {
		const subscribe = createSingleInstall<string>();
		const gate = deferred();
		const order: string[] = [];
		let aborted = false;
		const slow = async (
			_emit: (event: string) => void,
			signal: AbortSignal,
		) => {
			signal.addEventListener("abort", () => {
				aborted = true;
			});
			await gate.promise;
			order.push("first stopped");
			return "failed";
		};
		const leaveA = subscribe("codex", slow, () => {});
		const leaveB = subscribe("codex", slow, () => {});
		await Promise.resolve();
		leaveA();
		expect(aborted).toBe(false);
		leaveB();
		expect(aborted).toBe(true);

		subscribe(
			"codex",
			async () => {
				order.push("second started");
				return "done";
			},
			() => {},
		);
		await new Promise((r) => setTimeout(r, 0));
		expect(order).toEqual([]);
		gate.resolve();
		await new Promise((r) => setTimeout(r, 0));
		expect(order).toEqual(["first stopped", "second started"]);
	});
});
