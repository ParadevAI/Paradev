import type { AvailableCommand, Decision, Item } from "@superset/chat/protocol";
import { isKnownItem } from "@superset/chat/protocol";
import { memo } from "react";
import type { ChatForkTarget } from "../../../../../../types";
import { isBackgroundShell } from "../../../../utils/backgroundShell";
import { rowKindForItem } from "../../../../utils/rowKind";
import { subagentLaunches } from "../../../../utils/subagentRuns";
import { AgentMessageRow } from "../../../AgentMessageRow";
import { ApprovalRow } from "../../../ApprovalRow";
import { BackgroundShellRow } from "../../../BackgroundShellRow";
import { NestedToolCallRow } from "../../../NestedToolCallRow";
import { NoticeRow } from "../../../NoticeRow";
import { PlanRow } from "../../../PlanRow";
import { ReasoningRow } from "../../../ReasoningRow";
import { SubagentRunCard } from "../../../SubagentRunCard";
import { ToolCallRow } from "../../../ToolCallRow";
import { UnknownItemRow } from "../../../UnknownItemRow";
import { type PendingPrompt, UserMessageRow } from "../../../UserMessageRow";
import { RailStep } from "../RailStep";

export type ItemRowProps = {
	item: Item;
	childItems?: readonly Item[] | undefined;
	approvalTarget?: Item | undefined;
	asker?: string | undefined;
	afterTarget?: boolean;
	text: string;
	harness: string | undefined;
	commands?: ReadonlyMap<string, AvailableCommand> | undefined;
	pending?: PendingPrompt | undefined;
	onRespond: (approvalId: string, decision: Decision) => void;
	onFork?: ((target: ChatForkTarget) => void) | undefined;
	canForkToWorktree?: boolean;
	lastReply?: boolean;
	pagesShownEarlier?: string | undefined;
};

export const ItemRow = memo(function ItemRow({
	afterTarget = false,
	approvalTarget,
	asker,
	canForkToWorktree,
	childItems,
	commands,
	lastReply = false,
	harness,
	item,
	onFork,
	onRespond,
	pagesShownEarlier,
	pending,
	text,
}: ItemRowProps) {
	if (rowKindForItem(item) === "unknown" || !isKnownItem(item)) {
		return <UnknownItemRow item={item} />;
	}
	switch (item.kind) {
		case "user_message":
			return (
				<UserMessageRow
					commands={commands}
					harness={harness}
					item={item}
					pending={pending}
				/>
			);
		case "agent_message":
			return (
				<AgentMessageRow
					canForkToWorktree={canForkToWorktree}
					lastReply={lastReply}
					item={item}
					onFork={onFork}
					pagesShownEarlier={pagesShownEarlier}
					text={text}
				/>
			);
		case "reasoning":
			return <ReasoningRow item={item} text={text} />;
		case "tool_call": {
			const launches = subagentLaunches(item, childItems);
			if (launches) return <SubagentRunCard launches={launches} />;
			return (
				<RailStep>
					{isBackgroundShell(item) ? (
						<BackgroundShellRow item={item} />
					) : (childItems?.length ?? 0) > 0 ? (
						<NestedToolCallRow item={item} />
					) : (
						<ToolCallRow item={item} />
					)}
				</RailStep>
			);
		}
		case "plan":
			return <PlanRow item={item} />;
		case "approval_request":
			return (
				<ApprovalRow
					afterTarget={afterTarget}
					asker={asker}
					item={item}
					onRespond={onRespond}
					target={approvalTarget}
				/>
			);
		case "notice":
			return <NoticeRow item={item} />;
	}
});
