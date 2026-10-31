import { Trans } from "@lingui/react/macro";
import {
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@superset/ui/context-menu";
import {
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@superset/ui/dropdown-menu";
import { useRef } from "react";
import { LuFolderInput } from "react-icons/lu";
import { forwardTyping } from "../../utils/forwardTyping";
import { AutomationGroupPicker } from "../AutomationGroupPicker";

interface AutomationGroupMenuItemsProps {
	kind: "context" | "dropdown";
	/** Every group in the organization, sorted. */
	groups: string[];
	currentGroup: string | null;
	onMove: (group: string | null) => void;
}

/** A "Move to group" submenu for an automation's actions menu. */
export function AutomationGroupMenuItems({
	kind,
	groups,
	currentGroup,
	onMove,
}: AutomationGroupMenuItemsProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const context = kind === "context";
	const Sub = context ? ContextMenuSub : DropdownMenuSub;
	const SubTrigger = context ? ContextMenuSubTrigger : DropdownMenuSubTrigger;
	const SubContent = context ? ContextMenuSubContent : DropdownMenuSubContent;

	return (
		<Sub
			onOpenChange={(open) => {
				// After the submenu mounts and Radix places its own focus.
				if (open) {
					requestAnimationFrame(() =>
						requestAnimationFrame(() => inputRef.current?.focus()),
					);
				}
			}}
		>
			<SubTrigger
				className="gap-2"
				onKeyDownCapture={(event) => forwardTyping(inputRef, event)}
			>
				<LuFolderInput className="size-4 text-muted-foreground" />
				<Trans>Move to group</Trans>
			</SubTrigger>
			<SubContent className="w-60 p-0">
				<AutomationGroupPicker
					kind={kind}
					groups={groups}
					currentGroup={currentGroup}
					onMove={onMove}
					inputRef={inputRef}
				/>
			</SubContent>
		</Sub>
	);
}
