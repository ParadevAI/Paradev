import { afterEach, expect, test } from "bun:test";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { QueryClient } = await import("@tanstack/react-query");
const {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterContextProvider,
} = await import("@tanstack/react-router");
const { cleanup, render } = await import("@testing-library/react");
const { getQueryKey } = await import("@trpc/react-query");
const { env } = await import("renderer/env.renderer");
const { cloudTrpc } = await import("renderer/lib/cloud-trpc");
const { ChatPaneActionsProvider } = await import(
	"../../providers/ChatPaneActionsProvider"
);
const { collectHighlights } = await import(
	"../Transcript/utils/transcriptHighlights"
);
const { MarkdownView } = await import("./MarkdownView");

afterEach(cleanup);

test("find skips page cards while matching settled and streaming Markdown blocks", () => {
	const slug = "report-a3f9k";
	const url = `${env.NEXT_PUBLIC_WEB_URL}/page/${slug}`;
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false, staleTime: Infinity } },
	});
	queryClient.setQueryData(
		getQueryKey(cloudTrpc.page.preview, { slug }, "query"),
		{
			status: "readable",
			preview: {
				id: "page-1",
				slug,
				url,
				title: "report preview",
				description: "report details",
				updatedAt: new Date(),
				thumbnailUrl: null,
				createdBy: null,
			},
		},
	);
	const client = cloudTrpc.createClient({ links: [] });
	const router = createRouter({
		routeTree: createRootRoute(),
		history: createMemoryHistory(),
	});
	const message = (text: string) => (
		<cloudTrpc.Provider client={client} queryClient={queryClient}>
			<RouterContextProvider router={router}>
				<ChatPaneActionsProvider openPage={() => {}}>
					<MarkdownView findItemId="message-1" pageCards text={text} />
				</ChatPaneActionsProvider>
			</RouterContextProvider>
		</cloudTrpc.Provider>
	);
	const text = `[report](${url})\n\nA second report.`;
	const view = render(message(text));
	expect(view.getByRole("button").textContent).toContain("report preview");
	const current = { rowKey: "row-1", itemId: "message-1", occurrence: 1 };
	const plan = collectHighlights(view.container, "report", current);
	expect(plan.ranges).toHaveLength(2);
	expect(plan.current?.startContainer.textContent).toBe("A second report.");
	expect(collectHighlights(view.container, "preview", null).ranges).toEqual([]);

	view.rerender(message(`${text}\n\n\`\`\`text\nstreamed report`));
	const streaming = collectHighlights(view.container, "report", {
		...current,
		occurrence: 2,
	});
	expect(streaming.ranges).toHaveLength(3);
	expect(streaming.current?.toString()).toBe("report");
	expect(streaming.current?.startContainer.textContent).toContain(
		"streamed report",
	);
});
