import { describe, expect, test } from "bun:test";
import { emptySnapshot, type SessionSnapshot } from "@superset/chat/core";
import type {
	AgentMessage,
	Item,
	Notice,
	Plan,
	Reasoning,
	ToolCall,
	UserMessage,
} from "@superset/chat/protocol";
import { WORKSPACE_ATTACHMENTS_DIR } from "@superset/shared/workspace-attachments";
import { formatAttachmentTag } from "../../../../utils/attachmentTags";
import type { TranscriptRow } from "../transcriptRows";
import {
	countOccurrences,
	findMatches,
	findNeedle,
	findSegments,
} from "./transcriptFind";

const user: UserMessage = {
	id: "user-1",
	kind: "user_message",
	startedAtMs: 1,
	content: [
		{
			type: "text",
			text: `Fix the Login bug ${formatAttachmentTag({
				path: `${WORKSPACE_ATTACHMENTS_DIR}/shot.png`,
				type: "image/png",
			})}`,
		},
	],
};
const reply: AgentMessage = {
	id: "agent-1",
	kind: "agent_message",
	startedAtMs: 2,
	text: "The login bug is in login.ts",
};
const thought: Reasoning = {
	id: "reasoning-1",
	kind: "reasoning",
	startedAtMs: 3,
	text: "**Checking login**\n\nThe second paragraph mentions login too.",
};
const tool = (id: string, title: string): ToolCall => ({
	id,
	kind: "tool_call",
	startedAtMs: 4,
	title,
	toolKind: "edit",
	toolName: "edit",
	status: "completed",
	content: [{ type: "text", text: "login output body" }],
});
const plan: Plan = {
	id: "plan-1",
	kind: "plan",
	startedAtMs: 5,
	entries: [
		{ text: "Read login.ts", status: "completed" },
		{ text: "Write the fix", status: "pending" },
	],
};
const notice: Notice = {
	id: "notice-1",
	kind: "notice",
	startedAtMs: 6,
	noticeKind: "info",
	text: "login notice",
};

function itemRow(item: UserMessage | AgentMessage | Reasoning | Plan | Notice) {
	return { kind: "item", key: item.id, groupStart: false, item } as const;
}

function snapshotOf(items: readonly Item[]): SessionSnapshot {
	return {
		...emptySnapshot(),
		items: new Map(items.map((item) => [item.id, { item, turnId: "turn-1" }])),
	};
}

const snapshot = snapshotOf([user, reply, thought, plan, notice]);
const rows: TranscriptRow[] = [
	itemRow(user),
	itemRow(reply),
	itemRow(thought),
	{
		kind: "tool_run",
		key: "tools:turn-1:tool-1",
		groupStart: false,
		items: [tool("tool-1", "Edited login.ts"), tool("tool-2", "Ran tests")],
		defaultCollapsed: true,
	},
	itemRow(plan),
	itemRow(notice),
];

describe("findSegments", () => {
	test("takes the text a reader sees and leaves tool bodies and notices out", () => {
		const segments = findSegments(rows, snapshot, undefined);
		expect(segments).toEqual([
			{ rowKey: "user-1", itemId: "user-1", text: "Fix the Login bug" },
			{
				rowKey: "agent-1",
				itemId: "agent-1",
				text: "The login bug is in login.ts",
			},
			{ rowKey: "reasoning-1", itemId: "reasoning-1", text: "Checking login" },
			{
				rowKey: "tools:turn-1:tool-1",
				itemId: "tool-1",
				text: "Edited login.ts",
			},
			{ rowKey: "tools:turn-1:tool-1", itemId: "tool-2", text: "Ran tests" },
			{
				rowKey: "plan-1",
				itemId: "plan-1",
				text: "Read login.ts\nWrite the fix",
			},
		]);
	});

	test("reads a streaming reply from its live text", () => {
		const streaming: SessionSnapshot = {
			...snapshot,
			liveStreams: new Map([["text:agent-1", "Still typing about login"]]),
		};
		const [segment] = findSegments([itemRow(reply)], streaming, undefined);
		expect(segment?.text).toBe("Still typing about login");
	});
});

describe("findMatches", () => {
	test("counts case-insensitive hits per item in transcript order", () => {
		const segments = findSegments(rows, snapshot, undefined);
		expect(findMatches(segments, findNeedle("  Login "))).toEqual([
			{ rowKey: "user-1", itemId: "user-1", occurrence: 0 },
			{ rowKey: "agent-1", itemId: "agent-1", occurrence: 0 },
			{ rowKey: "agent-1", itemId: "agent-1", occurrence: 1 },
			{ rowKey: "reasoning-1", itemId: "reasoning-1", occurrence: 0 },
			{ rowKey: "tools:turn-1:tool-1", itemId: "tool-1", occurrence: 0 },
			{ rowKey: "plan-1", itemId: "plan-1", occurrence: 0 },
		]);
	});

	test("a blank query matches nothing", () => {
		const segments = findSegments(rows, snapshot, undefined);
		expect(findMatches(segments, findNeedle("   "))).toEqual([]);
	});
});

test("countOccurrences does not overlap hits", () => {
	expect(countOccurrences("aaaa", "aa")).toBe(2);
});

test("searches displayed Markdown phrases without counting hidden link URLs", () => {
	const markdown: AgentMessage = {
		...reply,
		text: "The **login** page uses [login](https://example.com/login).",
	};
	const segments = findSegments(
		[itemRow(markdown)],
		snapshotOf([markdown]),
		undefined,
	);
	expect(findMatches(segments, "login page")).toHaveLength(1);
	expect(findMatches(segments, "login")).toHaveLength(2);
	expect(findMatches(segments, "example.com")).toHaveLength(0);
});

test("searches file change labels and filenames inside a collapsed tool run", () => {
	const edit: ToolCall = {
		...tool("edit", "Edit"),
		content: [
			{
				type: "diff",
				path: "/project/login.ts",
				oldText: "old",
				newText: "new",
			},
		],
	};
	const rows: TranscriptRow[] = [
		{
			kind: "tool_run",
			key: "tools",
			groupStart: false,
			items: [edit],
			defaultCollapsed: true,
		},
	];
	const segments = findSegments(rows, snapshotOf([edit]), undefined);
	expect(findMatches(segments, "edited login.ts")).toEqual([
		{ rowKey: "tools", itemId: "edit", occurrence: 0 },
	]);
});
