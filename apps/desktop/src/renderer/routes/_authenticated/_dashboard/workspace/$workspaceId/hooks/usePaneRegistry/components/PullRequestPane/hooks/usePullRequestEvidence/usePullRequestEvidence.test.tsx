import { afterAll, afterEach, describe, expect, test } from "bun:test";
import type { AppRouter } from "@superset/trpc";
import { QueryClient } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { ReactNode } from "react";
import { env } from "renderer/env.renderer";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { usePullRequestEvidence } from "./usePullRequestEvidence";

const reactActGlobal = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(cleanup);
afterAll(() => {
	reactActGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

const pageUrl = (slug: string) =>
	`${env.NEXT_PUBLIC_WEB_URL.replace(/\/$/, "")}/page/${slug}`;

function renderEvidence(initialProps: {
	body: string | undefined;
	enabled: boolean;
}) {
	const asked: { path: string; input: unknown }[] = [];
	const link: TRPCLink<AppRouter> =
		() =>
		({ op }) =>
			observable((observer) => {
				asked.push({ path: op.path, input: op.input });
				const { slug } = op.input as { slug: string };
				observer.next({
					result: {
						data: slug.startsWith("private-")
							? { status: "missing" }
							: {
									status: "readable",
									preview: {
										id: `id-${slug}`,
										slug,
										title: `Title ${slug}`,
										description: null,
										url: pageUrl(slug),
										updatedAt: new Date(0),
										thumbnailUrl: null,
										createdBy: null,
									},
								},
					},
				});
				observer.complete();
			});
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const client = cloudTrpc.createClient({ links: [link] });
	const wrapper = ({ children }: { children: ReactNode }) => (
		<cloudTrpc.Provider client={client} queryClient={queryClient}>
			{children}
		</cloudTrpc.Provider>
	);
	const hook = renderHook(
		({ body, enabled }) => usePullRequestEvidence(body, enabled),
		{ wrapper, initialProps },
	);
	return { asked, hook };
}

describe("PR evidence from the PR description", () => {
	test("shows only the pages the PR body links, once each, in order", async () => {
		const body = [
			`Root cause page: ${pageUrl("root-cause-a1")}.`,
			"Unrelated link: https://github.com/owner/repo/pull/12",
			`Private: ${pageUrl("private-notes")}`,
			`Again: ${pageUrl("root-cause-a1")}`,
			`Screenshots (${pageUrl("screens-b2")})`,
		].join("\n");
		const { asked, hook } = renderEvidence({ body, enabled: false });
		expect(asked).toEqual([]);
		expect(hook.result.current.hasLinks).toBe(true);

		hook.rerender({ body, enabled: true });
		await waitFor(() => expect(hook.result.current.isPending).toBe(false));
		expect(asked).toEqual([
			{ path: "page.preview", input: { slug: "root-cause-a1" } },
			{ path: "page.preview", input: { slug: "private-notes" } },
			{ path: "page.preview", input: { slug: "screens-b2" } },
		]);
		expect(hook.result.current.pages).toEqual([
			{
				id: "id-root-cause-a1",
				slug: "root-cause-a1",
				title: "Title root-cause-a1",
				thumbnailUrl: null,
			},
			{
				id: "id-screens-b2",
				slug: "screens-b2",
				title: "Title screens-b2",
				thumbnailUrl: null,
			},
		]);
		expect(hook.result.current.totalCount).toBe(2);
	});

	test("previews the first 12 links and loads the rest on request", async () => {
		const slugs = Array.from({ length: 13 }, (_, i) => `page-${i + 1}`);
		const body = slugs.map(pageUrl).join("\n");
		const { asked, hook } = renderEvidence({ body, enabled: true });
		await waitFor(() => expect(hook.result.current.isPending).toBe(false));
		expect(asked).toHaveLength(12);
		expect(hook.result.current.pages).toHaveLength(12);
		expect(hook.result.current.moreCount).toBe(1);
		expect(hook.result.current.totalCount).toBeUndefined();

		act(() => hook.result.current.onShowMore());
		await waitFor(() => expect(hook.result.current.pages).toHaveLength(13));
		expect(hook.result.current.moreCount).toBe(0);
		expect(hook.result.current.totalCount).toBe(13);
	});

	test("a readable link past 12 unreadable ones stays reachable", async () => {
		const slugs = [
			...Array.from({ length: 12 }, (_, i) => `private-${i + 1}`),
			"screens-b2",
		];
		const body = slugs.map(pageUrl).join("\n");
		const { hook } = renderEvidence({ body, enabled: true });
		await waitFor(() => expect(hook.result.current.isPending).toBe(false));
		expect(hook.result.current.pages).toEqual([]);
		expect(hook.result.current.moreCount).toBe(1);

		act(() => hook.result.current.onShowMore());
		await waitFor(() =>
			expect(hook.result.current.pages.map((page) => page.slug)).toEqual([
				"screens-b2",
			]),
		);
	});

	test("a PR whose body links no page shows none, whatever the workspace has", () => {
		const { asked, hook } = renderEvidence({
			body: "Bump version to 0.0.37",
			enabled: true,
		});
		expect(hook.result.current.hasLinks).toBe(false);
		expect(hook.result.current.pages).toEqual([]);
		expect(asked).toEqual([]);
	});
});
