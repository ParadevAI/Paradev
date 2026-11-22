import { describe, expect, it } from "bun:test";
import { syncWhenEnabled } from "./syncWhenEnabled";

type Answer = { enabled: boolean; checkpointGapMs?: number | null };

function setup(answers: Array<boolean | Answer | Error>) {
	let starts = 0;
	const gaps: Array<number | null> = [];
	const pending: Array<{ run: () => void; ms: number }> = [];
	const stop = syncWhenEnabled({
		chatSync: {
			start: () => {
				starts += 1;
				return () => {};
			},
			setCheckpointGap: (ms) => {
				gaps.push(ms);
			},
		},
		api: {
			chatHistory: {
				syncEnabled: {
					query: async () => {
						const answer = answers.shift();
						if (answer instanceof Error) throw answer;
						if (typeof answer === "object") return answer;
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
	return { starts: () => starts, gaps, pending, settle, stop };
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

	it("keeps asking once syncing, and takes each checkpoint gap the API names", async () => {
		const box = setup([
			{ enabled: true, checkpointGapMs: 3_000 },
			{ enabled: true, checkpointGapMs: null },
		]);
		await box.settle();
		expect(box.pending.at(-1)?.ms).toBe(60 * 60 * 1000);
		box.pending.at(-1)?.run();
		await box.settle();
		expect(box.starts()).toBe(1);
		expect(box.gaps).toEqual([3_000, null]);
	});
});
