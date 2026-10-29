import {
	ContextMenuItem,
	ContextMenuSeparator,
} from "@superset/ui/context-menu";
import { useProjectTagFolderSections } from "../../../../../../hooks/useProjectTagFolderSections";

interface MoveToGroupItemsProps {
	projectId: string | null;
	onMoveToSection: (sectionId: string) => void;
}

export function MoveToGroupItems({
	projectId,
	onMoveToSection,
}: MoveToGroupItemsProps) {
	// The derived union — a tag-only folder with no stored row is a valid
	// move target.
	const { sections } = useProjectTagFolderSections(projectId);

	return (
		<>
			{sections.map((section) => (
				<ContextMenuItem
					key={section.id}
					onSelect={() => onMoveToSection(section.id)}
				>
					{section.color && (
						<span
							className="size-2 shrink-0 rounded-full mr-2"
							style={{ backgroundColor: section.color }}
						/>
					)}
					{section.name}
				</ContextMenuItem>
			))}
			{sections.length > 0 && <ContextMenuSeparator />}
		</>
	);
}
