import { describe, expect, it } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { hostQueryFn } from "./hostQueryFn";

const queryKey = ["host-service", "workspaces", "list", "org", "remote-mac"];

function observerOptions(hostUrl: string | null) {
	return {
		queryKey,
		enabled: hostUrl !== null,
		retry: false,
		networkMode: "always" as const,
		queryFn: hostQueryFn(hostUrl, async () => ["W1", "W2"]),
	};
}

describe("hostQueryFn", () => {
	it("keeps a host's cached data when an observer that saw it offline invalidates", async () => {
		const client = new QueryClient();
		const online = new QueryObserver(client, observerOptions("relay/hosts/x"));
		const stopOnline = online.subscribe(() => {});
		await online.refetch();
		expect(client.getQueryData(queryKey)).toEqual(["W1", "W2"]);

		const offline = new QueryObserver(client, observerOptions(null));
		const stopOffline = offline.subscribe(() => {});
		await client.invalidateQueries({ queryKey });

		expect(client.getQueryData(queryKey)).toEqual(["W1", "W2"]);
		stopOffline();
		stopOnline();
		client.clear();
	});
});
