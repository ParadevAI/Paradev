import { describe, expect, test } from "bun:test";
import { QueriesObserver, QueryClient } from "@tanstack/react-query";
import type { HostWorkspaceRow } from "@/lib/host-service/client";
import {
	combineHostWorkspaces,
	hostWorkspacesQueryOptions,
} from "./hostWorkspacesQuery";

const host = (isOnline: boolean) => ({
	organizationId: "org",
	machineId: "m1",
	isOnline,
});
const rows = [{ id: "w1", hostId: "m1" }] as unknown as HostWorkspaceRow[];
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("useHostsWorkspaces queries", () => {
	test("a host that dies mid-refetch keeps its rows once it reads offline", async () => {
		const client = new QueryClient();
		let reject: (error: Error) => void = () => {};
		let dead = false;
		const list = () =>
			dead
				? new Promise<HostWorkspaceRow[]>((_, fail) => {
						reject = fail;
					})
				: Promise.resolve(rows);
		const queries = (online: boolean) => [
			{
				...hostWorkspacesQueryOptions(host(online), "https://relay/m1", list),
				retryDelay: 0,
			},
		];
		const observer = new QueriesObserver(client, queries(true));
		const unsubscribe = observer.subscribe(() => {});
		await tick();

		dead = true;
		void client.refetchQueries({ queryKey: queries(true)[0]?.queryKey });
		await tick();
		observer.setQueries(queries(false));
		reject(new Error("relay timeout"));
		await tick();
		reject(new Error("relay timeout"));
		await tick();

		const byHost = combineHostWorkspaces(
			[host(false)],
			observer.getCurrentResult(),
		);
		expect(byHost.get("m1")?.workspaces.map((row) => row.id)).toEqual(["w1"]);
		expect(byHost.get("m1")?.workspaces[0]?.hostReachable).toBe(false);
		unsubscribe();
	});

	test("an online host that errored with nothing cached failed, one with a cache did not", () => {
		const failed = combineHostWorkspaces(
			[host(true)],
			[{ data: undefined, isError: true, isSuccess: false }],
		);
		const cached = combineHostWorkspaces(
			[host(true)],
			[{ data: rows, isError: true, isSuccess: false }],
		);
		expect(failed.get("m1")?.failed).toBe(true);
		expect(cached.get("m1")?.failed).toBe(false);
	});
});
