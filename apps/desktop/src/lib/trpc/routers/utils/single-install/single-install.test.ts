import { describe, expect, test } from "bun:test";
import { createSingleInstall } from "./single-install";

function deferred() {
	let resolve: () => void = () => {};
	const promise = new Promise<void>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("createSingleInstall", () => {
	test("a second caller joins the running install instead of starting another", async () => {
		const installs = createSingleInstall({ cancelled: "cancelled" });
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
		installs.join("gh", start, (event) => first.push(event));
		await settle();
		installs.join("gh", start, (event) => second.push(event));
		gate.resolve();
		await settle();

		expect(starts).toBe(1);
		expect(first).toEqual(["downloading", "done"]);
		expect(second).toEqual(["downloading", "done"]);
	});

	test("keeps installing after every screen leaves, and a screen that opens later sees it", async () => {
		const installs = createSingleInstall({ cancelled: "cancelled" });
		const gate = deferred();
		let aborted = false;
		const leave = installs.join(
			"codex",
			async (emit, signal) => {
				signal.addEventListener("abort", () => {
					aborted = true;
				});
				emit("downloading");
				await gate.promise;
				return "done";
			},
			() => {},
		);
		await settle();
		leave();
		expect(aborted).toBe(false);

		const later: string[] = [];
		installs.watch("codex", (event) => later.push(event));
		gate.resolve();
		await settle();
		expect(later).toEqual(["downloading", "done"]);
	});

	test("a screen watching before any install starts nothing, then sees the install another screen starts", async () => {
		const installs = createSingleInstall({ cancelled: "cancelled" });
		const events: string[] = [];
		installs.watch("claude", (event) => events.push(event));
		await settle();
		expect(events).toEqual([]);

		installs.join(
			"claude",
			async (emit) => {
				emit("downloading");
				return "done";
			},
			() => {},
		);
		await settle();
		expect(events).toEqual(["downloading", "done"]);
	});

	test("cancel stops the install, tells every screen, and a later install waits for it to stop", async () => {
		const installs = createSingleInstall({ cancelled: "cancelled" });
		const gate = deferred();
		const order: string[] = [];
		let aborted = false;
		const events: string[] = [];
		installs.join(
			"codex",
			async (emit, signal) => {
				signal.addEventListener("abort", () => {
					aborted = true;
				});
				emit("downloading");
				await gate.promise;
				order.push("first stopped");
				return "failed";
			},
			(event) => events.push(event),
		);
		await settle();
		installs.cancel("codex");
		expect(aborted).toBe(true);
		expect(events).toEqual(["downloading", "cancelled"]);

		installs.join(
			"codex",
			async () => {
				order.push("second started");
				return "done";
			},
			() => {},
		);
		await settle();
		expect(order).toEqual([]);
		gate.resolve();
		await settle();
		expect(order).toEqual(["first stopped", "second started"]);
		expect(events).toEqual(["downloading", "cancelled"]);
	});
});
