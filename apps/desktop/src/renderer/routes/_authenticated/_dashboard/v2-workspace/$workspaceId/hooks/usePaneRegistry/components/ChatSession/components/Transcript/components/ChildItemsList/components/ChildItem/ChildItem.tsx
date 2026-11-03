import { useLingui } from "@lingui/react/macro";
import { displayText, type SessionSnapshot } from "@superset/chat/core";
import { type Item, isKnownItem } from "@superset/chat/protocol";
import { useNestedItems } from "../../../../providers/NestedItemsProvider";
import { AgentMessageRow } from "../../../AgentMessageRow";
import { ApprovalRow } from "../../../ApprovalRow";
import { NestedToolCallRow } from "../../../NestedToolCallRow";
import { NoticeRow } from "../../../NoticeRow";
import { PlanRow } from "../../../PlanRow";
import { ReasoningRow } from "../../../ReasoningRow";
import { UserMessageRow } from "../../../UserMessageRow";
import { parentAgentName } from "./utils/parentAgentName";

export function ChildItem({
	item,
	snapshot,
}: {
	item: Item;
	snapshot: SessionSnapshot;
}) {
	const { t } = useLingui();
	const { respondToApproval } = useNestedItems();
	if (!isKnownItem(item)) return null;
	switch (item.kind) {
		case "user_message": {
			const parentName =
				item.from === "parent" && item.parentItemId
					? parentAgentName(snapshot.items, item.parentItemId)
					: null;
			return (
				<UserMessageRow
					harness={snapshot.session?.harness}
					item={item}
					sender={
						item.from !== "parent"
							? undefined
							: parentName
								? t({ message: `from ${parentName}` })
								: t({ message: "from main agent" })
					}
				/>
			);
		}
		case "agent_message":
			return (
				<AgentMessageRow
					item={item}
					lastReply={false}
					text={displayText(snapshot, item.id)}
				/>
			);
		case "reasoning":
			return <ReasoningRow item={item} text={displayText(snapshot, item.id)} />;
		case "tool_call":
			return <NestedToolCallRow item={item} />;
		case "approval_request": {
			const target =
				item.targetItemId != null
					? snapshot.items.get(item.targetItemId)?.item
					: undefined;
			return (
				<ApprovalRow
					item={item}
					onRespond={respondToApproval}
					target={target}
				/>
			);
		}
		case "plan":
			return <PlanRow item={item} />;
		case "notice":
			return <NoticeRow item={item} />;
		default:
			return null;
	}
}
