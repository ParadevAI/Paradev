import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { GitHubRepositoryPage } from "../../utils/fetchRepositoryPage";
import { useGitHubRepositories } from "./useGitHubRepositories";

function page(
	start: number,
	count: number,
	hasMore: boolean,
): GitHubRepositoryPage {
	return {
		repositories: Array.from({ length: count }, (_, index) => ({
			fullName: `owner/repo-${start + index}`,
			cloneUrl: `https://github.com/owner/repo-${start + index}.git`,
		})),
		hasMore,
	};
}

function wrapper(client: QueryClient) {
	return ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
}

describe("useGitHubRepositories", () => {
	test("renders page 1 while the rest of the pages are still loading", async () => {
		const requested: number[] = [];
		const secondPage = Promise.withResolvers<GitHubRepositoryPage>();
		const fetchPage = (pageNumber: number) => {
			requested.push(pageNumber);
			return pageNumber === 1
				? Promise.resolve(page(0, 100, true))
				: secondPage.promise;
		};

		const { result } = renderHook(
			() => useGitHubRepositories("http://host", fetchPage, true),
			{
				wrapper: wrapper(
					new QueryClient({ defaultOptions: { queries: { retry: false } } }),
				),
			},
		);

		await waitFor(() => expect(result.current.repositories).toHaveLength(100));
		expect(requested).toEqual([1, 2]);
		expect(result.current.isLoadingMore).toBe(true);

		await act(async () => {
			secondPage.resolve(page(100, 50, false));
		});

		await waitFor(() => expect(result.current.repositories).toHaveLength(150));
		expect(result.current.isLoadingMore).toBe(false);
		expect(result.current.repositories.at(-1)).toEqual({
			fullName: "owner/repo-149",
			cloneUrl: "https://github.com/owner/repo-149.git",
		});
		expect(requested).toEqual([1, 2]);
	});

	test("keeps the pages already loaded when a later page fails", async () => {
		const fetchPage = (pageNumber: number) =>
			pageNumber === 1
				? Promise.resolve(page(0, 100, true))
				: Promise.reject(new Error("gh failed"));

		const { result } = renderHook(
			() => useGitHubRepositories("http://host", fetchPage, true),
			{
				wrapper: wrapper(
					new QueryClient({ defaultOptions: { queries: { retry: false } } }),
				),
			},
		);

		await waitFor(() =>
			expect(result.current.error?.message).toBe("gh failed"),
		);
		expect(result.current.repositories).toHaveLength(100);
	});

	test("retries the page that failed", async () => {
		let failures = 1;
		const requested: number[] = [];
		const fetchPage = (pageNumber: number) => {
			requested.push(pageNumber);
			if (pageNumber === 2 && failures-- > 0) {
				return Promise.reject(new Error("gh failed"));
			}
			return Promise.resolve(
				pageNumber === 1 ? page(0, 100, true) : page(100, 50, false),
			);
		};

		const { result } = renderHook(
			() => useGitHubRepositories("http://host", fetchPage, true),
			{
				wrapper: wrapper(
					new QueryClient({ defaultOptions: { queries: { retry: false } } }),
				),
			},
		);

		await waitFor(() =>
			expect(result.current.error?.message).toBe("gh failed"),
		);

		await act(async () => {
			result.current.retry();
		});

		await waitFor(() => expect(result.current.repositories).toHaveLength(150));
		expect(result.current.error).toBeNull();
		expect(requested).toEqual([1, 2, 2]);
	});

	test("stops requesting pages once the picker is closed", async () => {
		const requested: number[] = [];
		const secondPage = Promise.withResolvers<GitHubRepositoryPage>();
		const fetchPage = (pageNumber: number) => {
			requested.push(pageNumber);
			return pageNumber === 1
				? Promise.resolve(page(0, 100, true))
				: secondPage.promise;
		};

		const { result, rerender } = renderHook(
			({ enabled }: { enabled: boolean }) =>
				useGitHubRepositories("http://host", fetchPage, enabled),
			{
				wrapper: wrapper(
					new QueryClient({ defaultOptions: { queries: { retry: false } } }),
				),
				initialProps: { enabled: true },
			},
		);

		await waitFor(() => expect(result.current.repositories).toHaveLength(100));
		rerender({ enabled: false });

		await act(async () => {
			secondPage.resolve(page(100, 100, true));
		});

		await waitFor(() => expect(result.current.repositories).toHaveLength(200));
		expect(requested).toEqual([1, 2]);
	});
});
