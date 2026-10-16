import { Checkbox } from "@superset/ui/checkbox";
import { cn } from "@superset/ui/utils";
import { LuChevronDown, LuCircleCheck } from "react-icons/lu";
import type {
	RoutedItemView,
	SlackComposeContextView,
} from "../../../../types";
import { HandoffLandedRow } from "../../../HandoffLandedRow";
import {
	isOpen,
	type RoutedEntry,
	type RoutedPayload,
} from "../../utils/routedValue";
import { DESTINATION_BRAND, DestinationChip } from "../DestinationChip";
import { DestinationEditor } from "../DestinationEditor";

interface RoutedRowProps {
	item: RoutedItemView;
	entry: RoutedEntry;
	compose: SlackComposeContextView | null;
	expanded: boolean;
	/** Expanded at least once: its editor stays mounted, so what was typed is kept. */
	opened: boolean;
	disabled?: boolean;
	onCheck: (checked: boolean) => void;
	onExpand: () => void;
	onPayload: (payload: RoutedPayload) => void;
}

/** One line of the checklist: its box, its words, who has it, and where it goes. */
export function RoutedRow({
	item,
	entry,
	compose,
	expanded,
	opened,
	disabled,
	onCheck,
	onExpand,
	onPayload,
}: RoutedRowProps) {
	const { destination, done } = item;
	const open = isOpen(item);
	const chip = destination && (
		<DestinationChip destination={destination} payload={entry.payload} />
	);
	return (
		<li
			data-routed-item={item.id}
			data-state={done ? "done" : open ? "open" : "unavailable"}
		>
			<div className="flex items-start gap-2.5 px-4 py-2.5">
				{done ? (
					<LuCircleCheck
						aria-hidden
						className="mt-0.5 size-4 shrink-0 text-success"
					/>
				) : (
					<Checkbox
						className="mt-0.5"
						aria-label={item.text}
						checked={open && entry.checked}
						disabled={disabled || !open}
						onCheckedChange={(next) => onCheck(next === true)}
						onKeyDown={(event) => {
							if (event.key !== "Enter") return;
							event.preventDefault();
							onExpand();
						}}
					/>
				)}
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<span
						className={cn(
							"text-[13px] text-foreground",
							done && "text-muted-foreground line-through",
						)}
					>
						{item.text}
					</span>
					{item.owner && (
						<span className="text-xs text-muted-foreground">{item.owner}</span>
					)}
					{done && (
						<HandoffLandedRow
							landed={done}
							brand={
								destination ? DESTINATION_BRAND[destination.kind] : "superset"
							}
						/>
					)}
					{!done && item.unavailable && (
						<p className="text-xs text-warning">{item.unavailable}</p>
					)}
				</div>
				{!done &&
					chip &&
					(open ? (
						<button
							type="button"
							aria-expanded={expanded}
							onClick={onExpand}
							className="flex max-w-[55%] shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-fill-hover"
						>
							{chip}
							<LuChevronDown
								aria-hidden
								className={cn(
									"size-3.5 shrink-0 text-muted-foreground transition-transform",
									expanded && "rotate-180",
								)}
							/>
						</button>
					) : (
						<span className="flex max-w-[55%] shrink-0 items-center px-2 py-1 opacity-60">
							{chip}
						</span>
					))}
			</div>
			{open && opened && destination && entry.payload && (
				<div hidden={!expanded} className="px-4 pb-3 pl-[42px]">
					<DestinationEditor
						destination={destination}
						payload={entry.payload}
						compose={compose}
						disabled={disabled}
						onChange={onPayload}
					/>
				</div>
			)}
		</li>
	);
}
