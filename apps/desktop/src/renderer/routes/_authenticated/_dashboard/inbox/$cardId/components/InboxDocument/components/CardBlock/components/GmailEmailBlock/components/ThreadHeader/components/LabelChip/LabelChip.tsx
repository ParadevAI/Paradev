import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { LuX } from "react-icons/lu";
import type { GmailLabelView } from "../../../../types";

interface LabelChipProps {
	label: GmailLabelView;
	name: string;
	onRemove?: () => void;
}

/** A label after the subject, with Gmail's × to take it off the thread. */
export function LabelChip({ label, name, onRemove }: LabelChipProps) {
	const { t } = useLingui();
	return (
		<span
			className={cn(
				"inline-flex h-[18px] shrink-0 items-center gap-0.5 rounded-[4px] pl-1 align-middle text-[12px] leading-none",
				onRemove ? "pr-0.5" : "pr-1",
				!label.color && "bg-muted text-muted-foreground",
			)}
			style={
				label.color
					? { backgroundColor: label.color.background, color: label.color.text }
					: undefined
			}
		>
			{name}
			{onRemove && (
				<button
					type="button"
					aria-label={t({ message: `Remove label ${name}` })}
					onClick={onRemove}
					className="flex size-3.5 items-center justify-center rounded-sm opacity-70 hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/15"
				>
					<LuX className="size-3" />
				</button>
			)}
		</span>
	);
}
