import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { LuArrowRight } from "react-icons/lu";
import { PickerList, type PickerRow } from "../PickerList";

export interface FieldFace {
	icon: ReactNode;
	text: string;
	/** Nothing is set: the chip reads the property's name. */
	empty: boolean;
}

export interface FieldMenu {
	key: string;
	name: string;
	placeholder: string;
	/** The key that opens the picker, as Linear shows it. */
	shortcut?: string;
	multi: boolean;
	rows: PickerRow[];
}

interface FieldPickerProps {
	model: FieldMenu;
	face: FieldFace;
	/** What the issue holds, when the chip's value differs from it. */
	was?: FieldFace;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onPick: (id: string) => void;
	disabled?: boolean;
}

/** One chip of a property row, as Linear draws it; it opens the property's menu. */
export function FieldPicker({
	model,
	face,
	was,
	open,
	onOpenChange,
	onPick,
	disabled,
}: FieldPickerProps) {
	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>
				<button
					type="button"
					disabled={disabled}
					data-field={model.key}
					data-changed={was ? "" : undefined}
					aria-label={face.text ? undefined : model.name}
					className={cn(
						"inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border border-border px-2 text-xs text-foreground outline-none",
						"enabled:hover:bg-fill-hover focus-visible:border-foreground/40 disabled:cursor-default",
						face.empty && "text-muted-foreground",
						was && "border-[#5e6ad2]/60 bg-[#5e6ad2]/10",
					)}
				>
					{was && (
						<>
							<span className="flex shrink-0 items-center gap-1.5 text-muted-foreground line-through">
								{was.icon}
								{was.text}
							</span>
							<LuArrowRight className="size-3 shrink-0 text-muted-foreground" />
						</>
					)}
					{face.icon}
					{face.text && <span className="truncate">{face.text}</span>}
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 p-0">
				<PickerList
					placeholder={model.placeholder}
					shortcut={model.shortcut}
					rows={model.rows}
					multi={model.multi}
					onPick={(id) => {
						onPick(id);
						if (!model.multi) onOpenChange(false);
					}}
				/>
			</PopoverContent>
		</Popover>
	);
}
