import type { ToolCall } from "@superset/chat/protocol";
import { useNestedItems } from "../../providers/NestedItemsProvider";
import { subagentLines } from "../../utils/subagentLines";
import { ChildItemsList } from "../ChildItemsList";
import { SubagentEventLine } from "../SubagentEventLine";
import { ToolCallRow } from "../ToolCallRow";

export function NestedToolCallRow({ item }: { item: ToolCall }) {
	const { childrenByParent } = useNestedItems();
	const children = childrenByParent.get(item.id);
	const lines = subagentLines(item, children);
	if (lines)
		return (
			<>
				{lines.map((line) => (
					<SubagentEventLine item={line} key={line.id} />
				))}
			</>
		);
	if (!children || children.length === 0) return <ToolCallRow item={item} />;
	return (
		<>
			<ToolCallRow item={item} />
			<ChildItemsList parentId={item.id} />
		</>
	);
}
