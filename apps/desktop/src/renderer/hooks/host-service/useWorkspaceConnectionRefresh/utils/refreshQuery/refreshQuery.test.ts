import { afterEach, expect, test } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { refreshQuery } from "./refreshQuery";

const queryKey = ["terminal-agent-bindings", "workspace"];
const cleanups: (() => void)[] = [];

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

function observedQuery(read: () => Promise<number>) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
	});
	const observer = new QueryObserver(queryClient, { queryKey, queryFn: read });
	cleanups.push(
		observer.subscribe(() => {}),
		() => queryClient.clear(),
	);
	return queryClient;
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

test("refreshes from one event share a single refetch", async () => {
	let reads = 0;
	const queryClient = observedQuery(async () => ++reads);
	await settled();
	expect(reads).toBe(1);

	for (let observer = 0; observer < 12; observer++) {
		refreshQuery(queryClient, queryKey);
	}
	await settled();
	expect(reads).toBe(2);

	refreshQuery(queryClient, queryKey);
	await settled();
	expect(reads).toBe(3);
});

test("a read in flight when the event lands does not settle the query", async () => {
	let reads = 0;
	let finishFirstRefetch: (value: number) => void = () => {};
	const queryClient = observedQuery(() => {
		reads++;
		if (reads === 2) {
			return new Promise<number>((resolve) => {
				finishFirstRefetch = resolve;
			});
		}
		return Promise.resolve(reads * 10);
	});
	await settled();

	refreshQuery(queryClient, queryKey);
	await settled();
	expect(reads).toBe(2);

	refreshQuery(queryClient, queryKey);
	await settled();
	finishFirstRefetch(20);
	await settled();

	expect(reads).toBe(3);
	expect(queryClient.getQueryData(queryKey)).toBe(30);
});
