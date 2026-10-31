import { Trans, useLingui } from "@lingui/react/macro";
import {
	AUTOMATION_GROUP_MAX_LENGTH,
	normalizeAutomationGroup,
} from "@superset/shared/automation-group";
import {
	ContextMenuItem,
	ContextMenuSeparator,
} from "@superset/ui/context-menu";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import { type KeyboardEvent, type RefObject, useRef, useState } from "react";
import { LuCheck, LuFolder, LuFolderMinus, LuPlus } from "react-icons/lu";
import { forwardTyping } from "../../utils/forwardTyping";

interface AutomationGroupPickerProps {
	kind: "context" | "dropdown";
	/** Every group in the organization, sorted. */
	groups: string[];
	/** Undefined when several automations are selected and may differ. */
	currentGroup: string | null | undefined;
	onMove: (group: string | null) => void;
	inputRef: RefObject<HTMLInputElement | null>;
}

/**
 * Menu body for choosing a group: a filter field on top, the matching groups,
 * and "Create group" when the typed name matches none. Mount it inside a menu
 * content; it unmounts with the menu, which clears the filter.
 */
export function AutomationGroupPicker({
	kind,
	groups,
	currentGroup,
	onMove,
	inputRef,
}: AutomationGroupPickerProps) {
	const { t } = useLingui();
	const [query, setQuery] = useState("");
	const rootRef = useRef<HTMLDivElement>(null);
	const Item = kind === "context" ? ContextMenuItem : DropdownMenuItem;
	const Separator =
		kind === "context" ? ContextMenuSeparator : DropdownMenuSeparator;

	const typed = normalizeAutomationGroup(query);
	const needle = typed?.toLocaleLowerCase() ?? "";
	const matches = groups.filter((group) =>
		group.toLocaleLowerCase().includes(needle),
	);
	const exact = groups.some((group) => group.toLocaleLowerCase() === needle);
	const canCreate = typed !== null && !exact;

	const items = () => [
		...(rootRef.current?.querySelectorAll<HTMLElement>(
			"[role=menuitem]:not([data-disabled])",
		) ?? []),
	];

	// Radix moves between items only once one has focus, so the field hands
	// focus to the list itself.
	const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		// Enter and arrows confirm IME composition (Chinese, Japanese, Korean).
		if (event.nativeEvent.isComposing) {
			event.stopPropagation();
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			items()[0]?.click();
		} else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			const list = items();
			(event.key === "ArrowDown" ? list[0] : list.at(-1))?.focus();
		}
		if (event.key !== "Escape") event.stopPropagation();
	};

	return (
		<div
			ref={rootRef}
			onKeyDownCapture={(event) => forwardTyping(inputRef, event)}
		>
			<div className="border-b border-border p-1">
				<input
					ref={inputRef}
					value={query}
					maxLength={AUTOMATION_GROUP_MAX_LENGTH}
					onChange={(event) => setQuery(event.target.value)}
					onKeyDown={onInputKeyDown}
					placeholder={t({ message: "Move to group…" })}
					aria-label={t({ message: "Filter or name a group" })}
					className="h-7 w-full bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
				/>
			</div>
			<div className="max-h-72 overflow-y-auto p-1">
				{matches.map((group) => (
					<Item
						key={group}
						onSelect={() => {
							if (group !== currentGroup) onMove(group);
						}}
					>
						<LuFolder className="size-4 text-muted-foreground" />
						<span className="min-w-0 flex-1 truncate">{group}</span>
						{group === currentGroup && <LuCheck className="size-4" />}
					</Item>
				))}
				{canCreate && typed && (
					<Item onSelect={() => onMove(typed)}>
						<LuPlus className="size-4 text-muted-foreground" />
						<span className="min-w-0 flex-1 truncate">
							<Trans>
								Create group <span className="font-medium">"{typed}"</span>
							</Trans>
						</span>
					</Item>
				)}
				{matches.length === 0 && !canCreate && (
					<p className="px-2 py-1.5 text-sm text-muted-foreground">
						<Trans>Type a name to create a group</Trans>
					</p>
				)}
				{currentGroup !== null && !typed && (
					<>
						<Separator />
						<Item onSelect={() => onMove(null)}>
							<LuFolderMinus className="size-4 text-muted-foreground" />
							<Trans>Remove from group</Trans>
						</Item>
					</>
				)}
			</div>
		</div>
	);
}
