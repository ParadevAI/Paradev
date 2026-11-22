import { afterEach, expect, mock, spyOn, test } from "bun:test";
import type { BackgroundSubagentResult } from "@superset/chat/client";
import type { SessionSnapshot } from "@superset/chat/core";
import type { ToolCall } from "@superset/chat/protocol";
import { toast } from "@superset/ui/sonner";
import {
	act,
	cleanup,
	fireEvent,
	render,
	renderHook,
} from "@testing-library/react";
import { SubagentEventLine } from "../../../Transcript/components/SubagentEventLine";
import { NestedItemsProvider } from "../../../Transcript/providers/NestedItemsProvider";
import { useMoveToBackground } from "./useMoveToBackground";

afterEach(cleanup);

const readme: ToolCall = {
	id: "subagent:c1",
	kind: "tool_call",
	title: "Readme and wait",
	toolKind: "think",
	toolName: "subagent",
	status: "running",
	content: [],
	startedAtMs: 1,
	subagent: true,
	subagentStatus: "running",
	canBackground: true,
};

function EventLine({
	item,
	backgroundSubagent,
}: {
	item: ToolCall;
	backgroundSubagent: (taskId: string) => Promise<BackgroundSubagentResult>;
}) {
	const moveToBackground = useMoveToBackground({ backgroundSubagent });
	const snapshot: SessionSnapshot = {
		session: { status: "running", harness: "acp", backgroundTasks: [] },
		turns: new Map(),
		items: new Map([[item.id, { item, turnId: "t1" }]]),
		liveStreams: new Map(),
		cursor: null,
		pendingReset: null,
	};
	return (
		<NestedItemsProvider
			value={{
				snapshot,
				childrenByParent: new Map(),
				requestItemBodies: () => {},
				respondToApproval: () => {},
				openSubagent: () => {},
				moveToBackground,
			}}
		>
			<SubagentEventLine item={item} />
		</NestedItemsProvider>
	);
}

test("move to background calls backgroundSubagent", async () => {
	const backgroundSubagent = mock(
		async (_taskId: string): Promise<BackgroundSubagentResult> => "moved",
	);
	const view = render(
		<EventLine backgroundSubagent={backgroundSubagent} item={readme} />,
	);
	await act(async () => {
		fireEvent.click(
			view.getByRole("button", {
				name: "Move Readme and wait to background",
			}),
		);
	});
	expect(backgroundSubagent).toHaveBeenCalledWith("subagent:c1");
});

test("only a running subagent that allows it offers the move", () => {
	const move = async (): Promise<BackgroundSubagentResult> => "moved";
	const name = "Move Readme and wait to background";
	const finished = render(
		<EventLine
			backgroundSubagent={move}
			item={{ ...readme, status: "completed", subagentStatus: "idle" }}
		/>,
	);
	expect(finished.queryByRole("button", { name })).toBeNull();
	cleanup();
	const fixed = render(
		<EventLine
			backgroundSubagent={move}
			item={{ ...readme, canBackground: false }}
		/>,
	);
	expect(fixed.queryByRole("button", { name })).toBeNull();
});

async function moveWith(outcome: () => Promise<BackgroundSubagentResult>) {
	const error = spyOn(toast, "error").mockImplementation(() => "toast");
	const warn = spyOn(console, "warn").mockImplementation(() => {});
	const hook = renderHook(() =>
		useMoveToBackground({ backgroundSubagent: outcome }),
	);
	await act(async () => {
		hook.result.current("subagent:c1");
		await Promise.resolve();
		await Promise.resolve();
	});
	const messages = error.mock.calls.map((call) => call[0]);
	error.mockRestore();
	warn.mockRestore();
	return messages;
}

test("a moved subagent shows no error", async () => {
	expect(await moveWith(async () => "moved")).toEqual([]);
});

test("an old host says to update", async () => {
	expect(await moveWith(async () => "unsupported")).toEqual([
		"Update this host to move subagents to the background",
	]);
});

test("a refused move says the subagent can't move now", async () => {
	expect(await moveWith(async () => "refused")).toEqual([
		"This subagent can't move to the background now",
	]);
});

test("a failed request says the move failed", async () => {
	expect(
		await moveWith(async () => {
			throw new Error("gone");
		}),
	).toEqual(["Couldn't move the subagent to the background"]);
});
