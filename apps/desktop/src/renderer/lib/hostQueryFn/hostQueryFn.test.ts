import { describe, expect, it } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { hostQueryFn } from "./hostQueryFn";

const queryKey = ["host-service", "workspaces", "list", "org", "remote-mac"];

function observerOptions(
	hostUrl: string | null,
	load: () => Promise<string[]>,
) {
	return {
		queryKey,
		enabled: hostUrl !== null,
		retry: false,
		networkMode: "always" as const,
		queryFn: hostQueryFn(hostUrl, load),
	};
}

describe("hostQueryFn", () => {
	it("has no query function without a host URL", () => {
		let calls = 0;
		const queryFn = hostQueryFn(null, async () => {
			calls++;
			return [];
		});
		expect(queryFn).toBeUndefined();
		expect(calls).toBe(0);
	});

	it("refetches from the reachable observer when an observer that saw the host offline invalidates", async () => {
		const client = new QueryClient();
		let served = ["W1", "W2"];
		const online = new QueryObserver(
			client,
			observerOptions("relay/hosts/x", async () => served),
		);
		const stopOnline = online.subscribe(() => {});
		await online.refetch();
		expect(client.getQueryData(queryKey)).toEqual(["W1", "W2"]);

		const offline = new QueryObserver(
			client,
			observerOptions(null, async () => []),
		);
		const stopOffline = offline.subscribe(() => {});
		served = ["W1", "W2", "W3"];
		await client.invalidateQueries({ queryKey });

		expect(client.getQueryData(queryKey)).toEqual(["W1", "W2", "W3"]);
		expect(client.getQueryState(queryKey)?.status).toBe("success");
		stopOffline();
		stopOnline();
		client.clear();
	});
});
