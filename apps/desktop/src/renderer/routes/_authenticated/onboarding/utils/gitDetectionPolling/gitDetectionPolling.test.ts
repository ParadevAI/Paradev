import { afterEach, expect, test } from "bun:test";
import {
	focusManager,
	QueryClient,
	QueryObserver,
} from "@tanstack/react-query";
import { gitDetectionPolling } from "./gitDetectionPolling";

afterEach(() => focusManager.setFocused(undefined));

async function countDetections(installed: boolean) {
	focusManager.setFocused(false);
	const client = new QueryClient();
	let calls = 0;
	const observer = new QueryObserver(client, {
		queryKey: ["detectGit", installed],
		queryFn: async () => {
			calls += 1;
			return { installed };
		},
		...gitDetectionPolling({ reportedAt: null, intervalMs: 5 }),
	});
	const unsubscribe = observer.subscribe(() => {});
	await new Promise((resolve) => setTimeout(resolve, 60));
	unsubscribe();
	client.clear();
	return calls;
}

test("keeps checking for git while the window is not focused", async () => {
	expect(await countDetections(false)).toBeGreaterThan(3);
});

test("stops checking once git is installed", async () => {
	expect(await countDetections(true)).toBe(1);
});
