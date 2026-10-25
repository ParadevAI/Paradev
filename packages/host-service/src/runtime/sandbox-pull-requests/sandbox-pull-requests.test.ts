import { afterEach, expect, jest, test } from "bun:test";
import { startSandboxPullRequestReporter } from "./sandbox-pull-requests";

afterEach(() => jest.useRealTimers());

test("a PR whose report failed arrives later, and a reported PR is never sent again", async () => {
	jest.useFakeTimers();
	const settle = async () => {
		jest.advanceTimersByTime(10 * 60 * 1000);
		for (let i = 0; i < 10; i++) await Promise.resolve();
	};
	const first = { repository: "acme/app", number: 1, linkedAt: 100 };
	const second = { repository: "acme/app", number: 2, linkedAt: 200 };
	let linked = [first];
	let failing = false;
	const received: number[] = [];
	let emitLinked = () => {};
	const stop = startSandboxPullRequestReporter({
		read: async () => linked,
		report: async (pullRequests) => {
			if (failing) throw new Error("offline");
			received.push(...pullRequests.map((pr) => pr.number));
			return { ignored: [] };
		},
		onLinked: (listener) => {
			emitLinked = listener;
			return () => {};
		},
	});

	await settle();
	failing = true;
	linked = [first, second];
	emitLinked();
	await settle();
	failing = false;
	await settle();
	stop();

	expect(received).toEqual([1, 2]);
});
