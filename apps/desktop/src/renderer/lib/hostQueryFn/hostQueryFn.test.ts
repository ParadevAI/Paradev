import { describe, expect, it } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { hostServiceQueryRetry } from "../host-service-client";
import { hostQueryFn } from "./hostQueryFn";

const queryKey = ["host-service", "workspaces", "list", "org", "remote-mac"];

function observerOptions(
	hostUrl: string | null,
	load: () => Promise<string[]> = async () => ["W1", "W2"],
	retry: number | typeof hostServiceQueryRetry = 0,
) {
	return {
		queryKey,
		enabled: hostUrl !== null,
		retry,
		retryDelay: 0,
		networkMode: "always" as const,
		queryFn: hostQueryFn(hostUrl, load),
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

	it("retries with the host URL once the offline observer sees the host", async () => {
		const client = new QueryClient();
		const online = new QueryObserver(client, observerOptions("relay/hosts/x"));
		const stopOnline = online.subscribe(() => {});
		await online.refetch();

		const offline = new QueryObserver(
			client,
			observerOptions(null, undefined, hostServiceQueryRetry),
		);
		const stopOffline = offline.subscribe(() => {});
		const invalidated = client.invalidateQueries({ queryKey });
		offline.setOptions(
			observerOptions(
				"relay/hosts/x",
				async () => ["W1", "W2", "W3"],
				hostServiceQueryRetry,
			),
		);
		await invalidated;

		expect(client.getQueryData(queryKey)).toEqual(["W1", "W2", "W3"]);
		stopOffline();
		stopOnline();
		client.clear();
	});
});
