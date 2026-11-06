import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { startRowDetailsRequest } from "./rowDetailsRequests";

describe("startRowDetailsRequest", () => {
	test("an older reply stays stale after a newer request finished and another started", () => {
		const queryClient = new QueryClient();
		const first = startRowDetailsRequest(queryClient, "page-1");
		const second = startRowDetailsRequest(queryClient, "page-1");
		second.finish();
		const third = startRowDetailsRequest(queryClient, "page-1");
		expect(first.isLatest()).toBe(false);
		expect(third.isLatest()).toBe(true);
	});

	test("requests from separate list instances on one cache share the guard", () => {
		const queryClient = new QueryClient();
		const fromUnmountedList = startRowDetailsRequest(queryClient, "page-1");
		const fromRemountedList = startRowDetailsRequest(queryClient, "page-1");
		expect(fromUnmountedList.isLatest()).toBe(false);
		expect(fromRemountedList.isLatest()).toBe(true);
	});

	test("one cache's requests never displace another cache's", () => {
		const first = startRowDetailsRequest(new QueryClient(), "page-1");
		const second = startRowDetailsRequest(new QueryClient(), "page-1");
		expect(first.isLatest()).toBe(true);
		expect(second.isLatest()).toBe(true);
	});
});
