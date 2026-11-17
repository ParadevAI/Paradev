import { describe, expect, it } from "bun:test";
import { syncWhenEnabled } from "./syncWhenEnabled";

function setup(answers: Array<boolean | Error>) {
	let starts = 0;
	const pending: Array<{ run: () => void; ms: number }> = [];
	const stop = syncWhenEnabled({
		chatSync: {
			start: () => {
				starts += 1;
				return () => {};
			},
		},
		api: {
			chatHistory: {
				syncEnabled: {
					query: async () => {
						const answer = answers.shift();
						if (answer instanceof Error) throw answer;
						return { enabled: answer ?? false };
					},
				},
			},
		} as never,
		schedule: (run, ms) => {
			pending.push({ run, ms });
			return () => {};
		},
	});
	const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
	return { starts: () => starts, pending, settle, stop };
}

describe("syncWhenEnabled", () => {
	it("does not sync for an owner without the flag, and asks again later", async () => {
		const box = setup([false]);
		await box.settle();
		expect(box.starts()).toBe(0);
		expect(box.pending.at(-1)?.ms).toBe(60 * 60 * 1000);
	});

	it("starts once the flag is on, after a failed ask", async () => {
		const box = setup([new Error("offline"), true]);
		await box.settle();
		expect(box.starts()).toBe(0);
		expect(box.pending.at(-1)?.ms).toBe(5 * 60 * 1000);
		box.pending.at(-1)?.run();
		await box.settle();
		expect(box.starts()).toBe(1);
	});
});
