import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import {
	emptySnapshot,
	formatAttachmentTag,
	reduceMany,
} from "@superset/chat/core";
import type { DurableEnvelope, DurableEvent } from "@superset/chat/protocol";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import type { ContextType } from "react";
import { HostWorkspacesContext } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { LocalHostServiceContext } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { SandboxAccessContext } from "renderer/routes/_authenticated/providers/SandboxAccessProvider";
import { StoredChatTranscript } from "./StoredChatTranscript";

// File icons resolve against the page URL, and the test DOM starts on about:blank.
const page = (
	window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM;
beforeAll(() => page.setURL("http://localhost/"));
afterAll(() => page.setURL("about:blank"));
afterEach(cleanup);

function journal(events: DurableEvent[]): DurableEnvelope[] {
	return events.map((event, index) => ({
		v: 1,
		sessionId: "s1",
		ts: index,
		cursor: { epoch: "e1", seq: index + 1 },
		event,
	}));
}

const snapshot = reduceMany(
	emptySnapshot(),
	journal([
		{
			type: "item",
			turnId: "t1",
			item: {
				id: "u1",
				kind: "user_message",
				clientId: "c1",
				startedAtMs: 1,
				content: [
					{
						type: "text",
						text: `fix it\n${formatAttachmentTag({ path: ".superset/attachments/shot.png", type: "image/png" })}`,
					},
					{
						type: "attachment",
						attachmentId: "a1",
						name: "pasted.png",
						mimeType: "image/png",
					},
				],
			},
		},
		{
			type: "item",
			turnId: "t1",
			item: {
				id: "tool-1",
				kind: "tool_call",
				title: "Edit",
				toolKind: "edit",
				toolName: "Edit",
				status: "completed",
				startedAtMs: 2,
				content: [
					{
						type: "diff",
						path: "/workspace/src/app.ts",
						oldText: "a\n",
						newText: "b\n",
					},
				],
			},
		},
		{
			type: "item",
			turnId: "t1",
			item: {
				id: "a1",
				kind: "agent_message",
				startedAtMs: 3,
				text: "Opened [the fix](https://github.com/acme/app/pull/12).",
			},
		},
		{
			type: "turn",
			turn: { id: "t1", status: "completed", startedAtMs: 1, completedAtMs: 3 },
		},
	]),
);

test("a cloud workspace's stored chat renders while its box wakes, with no workspace host to read from", () => {
	const view = render(
		<QueryClientProvider client={new QueryClient()}>
			<LocalHostServiceContext.Provider
				value={
					{ machineId: "machine-1", activeHostUrl: null } as NonNullable<
						ContextType<typeof LocalHostServiceContext>
					>
				}
			>
				<HostWorkspacesContext.Provider
					value={
						{ workspaces: [], isReady: true } as unknown as NonNullable<
							ContextType<typeof HostWorkspacesContext>
						>
					}
				>
					<SandboxAccessContext.Provider
						value={{
							targets: [],
							isReady: true,
							agentCredentialsChangedWorkspaceId: null,
							usageRefusal: null,
						}}
					>
						<StoredChatTranscript
							chatId="s1"
							pending={[]}
							snapshot={snapshot}
						/>
					</SandboxAccessContext.Provider>
				</HostWorkspacesContext.Provider>
			</LocalHostServiceContext.Provider>
		</QueryClientProvider>,
	);

	expect(view.getByText("Edited 1 file")).toBeTruthy();
	expect(view.getByTitle("shot.png")).toBeTruthy();
	expect(view.getByTitle("pasted.png")).toBeTruthy();
	expect(view.getByText("the fix")).toBeTruthy();
});
