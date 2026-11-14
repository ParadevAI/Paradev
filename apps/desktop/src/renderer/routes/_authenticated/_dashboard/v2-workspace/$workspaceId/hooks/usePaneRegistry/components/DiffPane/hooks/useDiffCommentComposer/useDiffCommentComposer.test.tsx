import { afterEach, expect, test } from "bun:test";
import { WorkspaceClientProvider } from "@superset/workspace-client";
import { act, cleanup, renderHook } from "@testing-library/react";
import { initTRPC, TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { ReactNode } from "react";
import superjson from "superjson";
import { useDiffCommentComposer } from "./useDiffCommentComposer";

afterEach(cleanup);

test("a selected chat receives the line comment without a terminal write", async () => {
	const calls: Array<{ path: string; input: unknown }> = [];
	const t = initTRPC.create({ transformer: superjson });
	const record = (path: string) =>
		t.procedure
			.input((x) => x)
			.mutation(({ input }) => {
				calls.push({ path, input });
				if (
					path === "chat" &&
					(input as { prompt: string }).prompt.includes("reject")
				) {
					throw new TRPCError({ code: "CONFLICT" });
				}
				return {};
			});
	const router = t.router({
		sessions: t.router({ send: record("chat") }),
		terminal: t.router({ send: record("terminal") }),
	});
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch: (request) =>
			fetchRequestHandler({
				endpoint: "/trpc",
				req: request,
				router,
				allowMethodOverride: true,
			}),
	});
	try {
		const wrapper = ({ children }: { children: ReactNode }) => (
			<WorkspaceClientProvider
				cacheKey="comment-test"
				hostUrl={`http://127.0.0.1:${server.port}`}
			>
				{children}
			</WorkspaceClientProvider>
		);
		const { result } = renderHook(
			() =>
				useDiffCommentComposer({
					workspaceId: "workspace-1",
					codeViewRef: { current: null },
					getFile: () => ({ path: "example.ts" }) as never,
				}),
			{ wrapper },
		);
		act(() =>
			result.current.onLineSelectionEnd(
				{ start: 3, end: 3, side: "additions" },
				{ type: "diff", item: { id: "file" } } as never,
			),
		);
		await act(async () => {
			await result.current.submit({
				comment: "Please adjust",
				target: {
					kind: "existing",
					terminalId: "terminal-1",
					chatSessionId: "chat-1",
				},
			});
		});
		expect(calls).toEqual([
			{
				path: "chat",
				input: {
					workspaceId: "workspace-1",
					sessionId: "chat-1",
					prompt: "In example.ts:L3: Please adjust",
				},
			},
		]);
		expect(result.current.composerAnnotationsByItemId).toBeNull();
		act(() =>
			result.current.onLineSelectionEnd(
				{ start: 5, end: 5, side: "additions" },
				{ type: "diff", item: { id: "file" } } as never,
			),
		);
		await act(async () => {
			await result.current.submit({
				comment: "terminal feedback",
				target: { kind: "existing", terminalId: "terminal-2" },
			});
		});
		expect(calls[1]).toEqual({
			path: "terminal",
			input: {
				workspaceId: "workspace-1",
				terminalId: "terminal-2",
				text: "In example.ts:L5: terminal feedback",
				submit: true,
			},
		});
		act(() =>
			result.current.onLineSelectionEnd(
				{ start: 6, end: 6, side: "additions" },
				{ type: "diff", item: { id: "file" } } as never,
			),
		);
		await act(async () => {
			await result.current.submit({
				comment: "reject",
				target: {
					kind: "existing",
					terminalId: "terminal-1",
					chatSessionId: "chat-1",
				},
			});
		});
		expect(result.current.composerAnnotationsByItemId?.has("file")).toBe(true);
		expect(calls.map((call) => call.path)).toEqual([
			"chat",
			"terminal",
			"chat",
		]);
	} finally {
		server.stop(true);
	}
});
