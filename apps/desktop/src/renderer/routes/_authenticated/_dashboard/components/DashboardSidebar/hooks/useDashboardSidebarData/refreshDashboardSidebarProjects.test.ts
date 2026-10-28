import { afterEach, expect, it } from "bun:test";
import {
	QueryClient,
	type QueryKey,
	QueryObserver,
} from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { getHostProjectsQueryKey } from "renderer/hooks/host-projects/useHostProjects/useHostProjects.utils";
import { getHostWorkspacesQueryKey } from "renderer/hooks/host-workspaces/useHostWorkspaces/useHostWorkspaces.utils";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { refreshDashboardSidebarProjects } from "./refreshDashboardSidebarProjects";

const client = new QueryClient({
	defaultOptions: {
		queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
	},
});
const unsubscribe: Array<() => void> = [];
afterEach(() => {
	for (const dispose of unsubscribe.splice(0)) dispose();
	client.clear();
});

function observe(
	queryKey: QueryKey,
	queryFn = async () => "fresh",
	enabled = true,
) {
	const observer = new QueryObserver(client, {
		queryKey,
		queryFn,
		enabled,
		initialData: "cached",
	});
	unsubscribe.push(observer.subscribe(() => {}));
}

it("refreshes sidebar data across hosts in this organization and leaves other data alone", async () => {
	const target = { organizationId: "org", machineId: "local" };
	const input = { organizationId: "org" };
	const keys: QueryKey[] = [
		getHostProjectsQueryKey(target),
		getHostProjectsQueryKey({ ...target, machineId: "remote" }),
		getHostWorkspacesQueryKey(target),
		getHostWorkspacesQueryKey({ ...target, machineId: "remote" }),
		["host-tag-folders", "org", "local"],
		["dashboard-sidebar", "pull-requests", "org", "local"],
		getQueryKey(cloudTrpc.cloudWorkspace.list, input, "query"),
		getQueryKey(cloudTrpc.cloudWorkspace.repositories, input, "query"),
		getQueryKey(
			cloudTrpc.cloudWorkspace.pullRequests,
			{ ...input, archived: false },
			"query",
		),
	];
	for (const key of keys) observe(key);
	const untouched = [
		getHostProjectsQueryKey({ ...target, organizationId: "other-org" }),
		["host-service", "terminal-agents", "org", "local"],
		getQueryKey(
			cloudTrpc.cloudWorkspace.list,
			{ organizationId: "other-org" },
			"query",
		),
	];
	for (const key of untouched) observe(key);
	const offline = getHostWorkspacesQueryKey({
		...target,
		machineId: "offline",
	});
	observe(offline, async () => "unexpected", false);
	const inactive = getHostProjectsQueryKey({
		...target,
		machineId: "inactive",
	});
	client.setQueryData(inactive, "cached");

	await refreshDashboardSidebarProjects(client, "org");

	for (const key of keys) expect(client.getQueryData(key)).toBe("fresh");
	for (const key of [...untouched, offline, inactive]) {
		expect(client.getQueryData(key)).toBe("cached");
	}
});

it("waits for every refresh and retains cached data when one host fails", async () => {
	const failed = Promise.withResolvers<void>();
	const pending = Promise.withResolvers<string>();
	const projectKey = getHostProjectsQueryKey({
		organizationId: "org",
		machineId: "local",
	});
	const workspaceKey = getHostWorkspacesQueryKey({
		organizationId: "org",
		machineId: "remote",
	});
	observe(projectKey, async () => {
		failed.resolve();
		throw new Error("Host unavailable");
	});
	observe(workspaceKey, () => pending.promise);
	let finished = false;
	const refresh = refreshDashboardSidebarProjects(client, "org").finally(() => {
		finished = true;
	});
	await failed.promise;
	expect(finished).toBe(false);
	pending.resolve("fresh");
	await expect(refresh).rejects.toThrow("Host unavailable");
	expect(client.getQueryData(projectKey)).toBe("cached");
	expect(client.getQueryData(workspaceKey)).toBe("fresh");
});
