import { afterEach, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import type {
	HostUsageObservation,
	UsageAccount,
} from "shared/host-usage-observation";
import { readSharedUsageQuota } from "./readUsageObservation";
import {
	acceptHostUsageObservation,
	consumeHostUsageInvalidation,
} from "./usage-observations";

const clients: QueryClient[] = [];
function client() {
	const value = new QueryClient();
	clients.push(value);
	return value;
}
afterEach(() => {
	for (const value of clients.splice(0)) value.clear();
});
function quota(accountKey: string): UsageAccount[] {
	return [
		{
			agent: "claude",
			credentialKind: "subscription",
			accountKey,
			sourceLabel: accountKey,
			email: null,
			plan: null,
			status: "ok",
			statusDetail: null,
			windows: [],
			creditsBalance: null,
			extraUsage: null,
			selection: null,
			isDefault: false,
			fetchedAt: new Date(0),
		},
	];
}
function observation(version: number, key: string): HostUsageObservation {
	return {
		hostUrl: "http://local",
		version,
		data: quota(key),
		offline: false,
		loading: false,
	};
}

test("a late IPC result uses the newest observation already received by the renderer", async () => {
	const queryClient = client();
	acceptHostUsageObservation(queryClient, observation(4, "new"));
	let directCalls = 0;
	const value = await readSharedUsageQuota(
		queryClient,
		async () => observation(3, "old"),
		async () => {
			directCalls++;
			return quota("remote");
		},
	);
	expect(value[0]?.accountKey).toBe("new");
	expect(directCalls).toBe(0);
});

test("unsupported main-owned hosts preserve the existing direct host route", async () => {
	const value = await readSharedUsageQuota(
		client(),
		async () => null,
		async () => quota("remote"),
	);
	expect(value[0]?.accountKey).toBe("remote");
});

test("a known offline observation never silently falls back or claims cached data is current", async () => {
	let directCalls = 0;
	const value = observation(3, "old");
	value.offline = true;
	await expect(
		readSharedUsageQuota(
			client(),
			async () => value,
			async () => {
				directCalls++;
				return quota("remote");
			},
		),
	).rejects.toThrow("unavailable");
	expect(directCalls).toBe(0);
});

test("an identity clear quarantines an older in-flight reading", async () => {
	const queryClient = client();
	const cleared = observation(5, "new");
	cleared.data = null;
	cleared.offline = true;
	acceptHostUsageObservation(queryClient, cleared);
	await expect(
		readSharedUsageQuota(
			queryClient,
			async () => observation(4, "old"),
			async () => quota("remote"),
		),
	).rejects.toThrow("unavailable");
});

test("an aborted caller does not publish its completed IPC observation", async () => {
	const controller = new AbortController();
	controller.abort();
	const queryClient = client();
	await expect(
		readSharedUsageQuota(
			queryClient,
			async () => observation(5, "aborted"),
			async () => quota("remote"),
			controller.signal,
		),
	).rejects.toThrow();
	expect(
		acceptHostUsageObservation(queryClient, observation(2, "current")).data?.[0]
			?.accountKey,
	).toBe("current");
});

test("a source invalidation is consumed once across hook subscribers", () => {
	const queryClient = client();
	const cleared = observation(3, "a");
	cleared.data = null;
	cleared.invalidated = true;
	const accepted = acceptHostUsageObservation(queryClient, cleared);
	expect(consumeHostUsageInvalidation(queryClient, accepted)).toBe(true);
	expect(consumeHostUsageInvalidation(queryClient, accepted)).toBe(false);
	const failed = observation(4, "a");
	failed.data = null;
	failed.offline = true;
	expect(
		consumeHostUsageInvalidation(
			queryClient,
			acceptHostUsageObservation(queryClient, failed),
		),
	).toBe(false);
});
