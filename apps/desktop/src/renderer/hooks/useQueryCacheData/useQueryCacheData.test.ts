import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { readQueryCacheData } from "./useQueryCacheData";

describe("readQueryCacheData", () => {
	test("returns the data of loaded queries under the prefix only", () => {
		const queryClient = new QueryClient();
		queryClient.setQueryData(["bindings", "a"], [1]);
		queryClient.setQueryData(["bindings", "b"], [2, 3]);
		queryClient.setQueryData(["other", "a"], [9]);
		queryClient.getQueryCache().build(queryClient, {
			queryKey: ["bindings", "not-loaded"],
		});

		expect(readQueryCacheData<number[]>(queryClient, ["bindings"])).toEqual([
			[1],
			[2, 3],
		]);
	});
});
