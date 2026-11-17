import type { ToolCall } from "@superset/chat/protocol";
import { useNestedItems } from "../../providers/NestedItemsProvider";
import { isBackgroundShell } from "../../utils/backgroundShell";
import { subagentLaunches } from "../../utils/subagentRuns";
import { BackgroundShellRow } from "../BackgroundShellRow";
import { ChildItemsList } from "../ChildItemsList";
import { SubagentRunCard } from "../SubagentRunCard";
import { ToolCallRow } from "../ToolCallRow";

export function NestedToolCallRow({ item }: { item: ToolCall }) {
	const { childrenByParent } = useNestedItems();
	const children = childrenByParent.get(item.id);
	const launches = subagentLaunches(item, children);
	if (launches) return <SubagentRunCard launches={launches} />;
	if (isBackgroundShell(item)) return <BackgroundShellRow item={item} />;
	if (!children || children.length === 0) return <ToolCallRow item={item} />;
	return (
		<>
			<ToolCallRow item={item} />
			<ChildItemsList parentId={item.id} />
		</>
	);
}
