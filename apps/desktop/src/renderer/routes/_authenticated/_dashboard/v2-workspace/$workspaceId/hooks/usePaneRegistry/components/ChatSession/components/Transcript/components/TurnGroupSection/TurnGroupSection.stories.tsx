import type { Meta, StoryObj } from "@storybook/react-vite";
import {
	deriveChildrenByParent,
	deriveTimeline,
	type SessionSnapshot,
} from "@superset/chat/core";
import type { Item, ToolCall, Turn } from "@superset/chat/protocol";
import { pageLinkFinder } from "../../../../utils/pageLinks";
import { NestedItemsProvider } from "../../providers/NestedItemsProvider";
import { replyFooters } from "../../utils/replyFooters";
import { transcriptRows } from "../../utils/transcriptRows";
import { TurnGroupSection } from "./TurnGroupSection";

const NOW = Date.now();

function user(id: string, text: string, startedAtMs: number): Item {
	return {
		id,
		kind: "user_message",
		clientId: id,
		startedAtMs,
		content: [{ type: "text", text }],
	} as Item;
}

function agent(id: string, text: string, startedAtMs: number): Item {
	return {
		id,
		kind: "agent_message",
		startedAtMs,
		completedAtMs: startedAtMs,
		text,
	} as Item;
}

function shell(
	id: string,
	command: string,
	startedAtMs: number,
	status: ToolCall["status"] = "completed",
): ToolCall {
	return {
		id,
		kind: "tool_call",
		title: command,
		toolKind: "execute",
		toolName: "Bash",
		status,
		content: [],
		rawInput: { command },
		startedAtMs,
		...(status === "running" ? {} : { completedAtMs: startedAtMs + 1_000 }),
	};
}

function snapshotOf(items: readonly Item[], turn: Turn): SessionSnapshot {
	return {
		session: {
			status: turn.status === "running" ? "running" : "idle",
			harness: "acp",
			backgroundTasks: [],
		},
		turns: new Map([[turn.id, turn]]),
		items: new Map(items.map((item) => [item.id, { item, turnId: turn.id }])),
		liveStreams: new Map(),
		cursor: null,
		pendingReset: null,
	};
}

const started = NOW - 268_000;

const workBeforeSteer: Item[] = [
	user(
		"u1",
		"also superset home reviewed it, can you check those comments?",
		started,
	),
	shell(
		"s1",
		"gh api repos/ParadevAI/Paradev/pulls/9115/reviews --paginate > /tmp/pr-reviews.json",
		started + 2_000,
	),
	agent(
		"a1",
		"Found it — `superset-home` left a review comment (an issue-level comment, not inline). My listing cut it off; fetching the full text.",
		started + 5_000,
	),
	shell(
		"s2",
		"gh api repos/ParadevAI/Paradev/issues/9115/comments",
		started + 6_000,
	),
	shell("s3", "rg -n superset-home /tmp/pr-reviews.json", started + 7_000),
	shell(
		"s4",
		"gh pr view 9115 --comments --json comments",
		NOW - 25_000,
		"running",
	),
];

function Transcript({ snapshot }: { snapshot: SessionSnapshot }) {
	const childrenByParent = deriveChildrenByParent(snapshot);
	const { rows, inlineReplyKeys } = replyFooters(
		transcriptRows(
			deriveTimeline(snapshot, { nestChildItems: true }),
			[],
			new Set(),
			pageLinkFinder("https://app.superset.sh"),
		),
	);
	return (
		<NestedItemsProvider
			value={{
				snapshot,
				childrenByParent,
				requestItemBodies: () => {},
				respondToApproval: () => {},
				openSubagent: () => {},
			}}
		>
			<div className="mx-auto flex max-w-3xl flex-col">
				{rows.map((row) => (
					<TurnGroupSection
						childrenByParent={childrenByParent}
						isEntryCollapsed={(_key, collapsed) => collapsed}
						key={row.key}
						lastReply={inlineReplyKeys.has(row.key)}
						onDiscardPrompt={() => {}}
						onRespond={() => {}}
						onRetryPrompt={() => {}}
						onToggleEntry={() => {}}
						row={row}
						snapshot={snapshot}
					/>
				))}
			</div>
		</NestedItemsProvider>
	);
}

const meta = {
	title: "Chat/Transcript/Steered message",
	component: Transcript,
} satisfies Meta<typeof Transcript>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WhileToolRuns: Story = {
	args: {
		snapshot: snapshotOf(
			[
				...workBeforeSteer,
				user(
					"u2",
					"also look into superset page in the review, you can give all that to a subagent",
					NOW - 3_000,
				),
			],
			{ id: "t1", status: "running", startedAtMs: started },
		),
	},
};

export const AfterAgentReadIt: Story = {
	args: {
		snapshot: snapshotOf(
			[
				...workBeforeSteer.map((item) =>
					item.kind === "tool_call"
						? {
								...item,
								toolKind: "fetch",
								status: "completed",
								completedAtMs: item.completedAtMs ?? NOW - 2_000,
							}
						: item,
				),
				user(
					"u2",
					"also look into superset page in the review, you can give all that to a subagent",
					NOW - 3_000,
				),
				agent(
					"a2",
					"Got it — handing the review comments and the superset page to a subagent.",
					NOW - 1_000,
				),
			] as Item[],
			{
				id: "t1",
				status: "completed",
				startedAtMs: started,
				completedAtMs: NOW,
			},
		),
	},
};
