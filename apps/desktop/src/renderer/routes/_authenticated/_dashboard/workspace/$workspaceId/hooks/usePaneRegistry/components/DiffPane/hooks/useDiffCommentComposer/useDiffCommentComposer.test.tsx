import { expect, mock, test } from "bun:test";
import { workspaceTrpc } from "@superset/workspace-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { useDiffCommentComposer } from "./useDiffCommentComposer";

test("blocks a second submit from the same draft while a send is pending and allows retry", async () => {
	const queryClient = new QueryClient();
	const client = workspaceTrpc.createClient({ links: [] });
	const failed = Promise.withResolvers<null>();
	const retry = Promise.withResolvers<{ terminalId: string }>();
	const onCreateNewAgentSession = mock(
		(): Promise<{ terminalId: string } | null> => retry.promise,
	);
	onCreateNewAgentSession.mockImplementationOnce(() => failed.promise);

	const { result, rerender, unmount } = renderHook(
		() =>
			useDiffCommentComposer({
				workspaceId: "workspace",
				codeViewRef: { current: null },
				getFile: () => ({
					path: "file.ts",
					status: "modified",
					additions: 1,
					deletions: 0,
					source: { kind: "unstaged" },
				}),
				onCreateNewAgentSession,
			}),
		{
			wrapper: ({ children }: { children: ReactNode }) => (
				<workspaceTrpc.Provider client={client} queryClient={queryClient}>
					<QueryClientProvider client={queryClient}>
						{children}
					</QueryClientProvider>
				</workspaceTrpc.Provider>
			),
		},
	);
	try {
		const context = {
			type: "diff",
			item: { id: "file" },
		} as Parameters<typeof result.current.onLineSelectionEnd>[1];
		act(() => result.current.onLineSelectionEnd({ start: 3, end: 3 }, context));
		act(() => result.current.setComment("Check this condition"));
		const submit = () =>
			result.current.submit({
				comment: result.current.comment,
				target: { kind: "new", configId: "test-agent", placement: "new-tab" },
			});
		let sending: Promise<void> | undefined;
		act(() => {
			sending = submit();
		});
		rerender();
		act(() => {
			void submit();
		});
		expect(onCreateNewAgentSession).toHaveBeenCalledTimes(1);
		expect(result.current.submitting).toBe(true);

		await act(async () => {
			failed.resolve(null);
			await sending;
		});
		expect(result.current.submitting).toBe(false);
		expect(result.current.comment).toBe("Check this condition");

		await act(async () => {
			const next = submit();
			retry.resolve({ terminalId: "new-terminal" });
			await next;
		});
		expect(onCreateNewAgentSession).toHaveBeenCalledTimes(2);
		expect(result.current.comment).toBe("");
		expect(result.current.submitting).toBe(false);
	} finally {
		unmount();
		queryClient.clear();
	}
});
