import { cn } from "@superset/ui/utils";
import { useNestedItems } from "../../providers/NestedItemsProvider";
import { ChildItem } from "./components/ChildItem";

export function ChildItemsList({
	parentId,
	flat = false,
}: {
	parentId: string;
	flat?: boolean;
}) {
	const { childrenByParent, snapshot } = useNestedItems();
	const children = childrenByParent.get(parentId);
	if (!children || children.length === 0) return null;
	return (
		<div
			className={cn(
				"flex flex-col gap-0.5",
				!flat && "mt-0.5 mb-2 ml-[7px] border-border/60 border-l pl-3",
			)}
		>
			{children.map((child) => (
				<ChildItem item={child} key={child.id} snapshot={snapshot} />
			))}
		</div>
	);
}
