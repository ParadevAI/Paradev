import { Trans } from "@lingui/react/macro";
import { Kbd } from "@superset/ui/kbd";
import { cn } from "@superset/ui/utils";
import { Fragment, type KeyboardEvent, type ReactNode, useState } from "react";
import { LuCheck } from "react-icons/lu";

export interface PickerRow {
	/** The value's id; empty for the "No assignee" kind of row. */
	id: string;
	label: string;
	icon: ReactNode;
	detail?: string;
	/** The number key that picks the row. */
	hint?: string;
	checked: boolean;
	section?: string;
}

interface PickerListProps {
	placeholder: string;
	shortcut?: string;
	rows: PickerRow[];
	multi: boolean;
	onPick: (id: string) => void;
}

/** Linear's property menu, which other cards' pickers share: a search field that names the action, then 32px rows with a check on the current value and the number key that picks each. */
export function PickerList({
	placeholder,
	shortcut,
	rows,
	multi,
	onPick,
}: PickerListProps) {
	const [query, setQuery] = useState("");
	const [cursor, setCursor] = useState<number | null>(null);
	const needle = query.trim().toLowerCase();
	const shown = needle
		? rows.filter((row) => row.label.toLowerCase().includes(needle))
		: rows;
	const checked = shown.findIndex((row) => row.checked);
	const highlighted =
		shown.length === 0
			? -1
			: Math.min(cursor ?? Math.max(checked, 0), shown.length - 1);

	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			if (shown.length === 0) return;
			const step = event.key === "ArrowDown" ? 1 : -1;
			setCursor((highlighted + step + shown.length) % shown.length);
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			const row = shown[highlighted];
			if (row) onPick(row.id);
			return;
		}
		if (query === "" && /^\d$/.test(event.key)) {
			const row = rows.find((item) => item.hint === event.key);
			if (!row) return;
			event.preventDefault();
			onPick(row.id);
		}
	};

	return (
		<div className="flex flex-col">
			<div className="flex items-center gap-2 border-b border-border px-3 py-2">
				<input
					value={query}
					onChange={(event) => {
						setQuery(event.target.value);
						setCursor(0);
					}}
					onKeyDown={onKeyDown}
					placeholder={placeholder}
					aria-label={placeholder}
					className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
				/>
				{shortcut && <Kbd>{shortcut}</Kbd>}
			</div>
			<div
				role="listbox"
				aria-multiselectable={multi || undefined}
				className="flex max-h-72 flex-col overflow-y-auto p-1"
			>
				{shown.length === 0 && (
					<div className="px-2 py-1.5 text-[13px] text-muted-foreground">
						<Trans>No results</Trans>
					</div>
				)}
				{shown.map((row, index) => (
					<Fragment key={row.id}>
						{row.section && row.section !== shown[index - 1]?.section && (
							<div className="px-2 pt-2 pb-1 text-xs text-muted-foreground">
								{row.section}
							</div>
						)}
						<button
							type="button"
							role="option"
							aria-selected={row.checked}
							data-highlighted={index === highlighted || undefined}
							onMouseEnter={() => setCursor(index)}
							onClick={() => onPick(row.id)}
							className={cn(
								"flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-left text-[13px] text-foreground outline-none",
								index === highlighted && "bg-fill-hover",
							)}
						>
							<span className="flex size-4 shrink-0 items-center justify-center">
								{row.icon}
							</span>
							<span
								className={cn(
									"truncate",
									row.detail ? "max-w-[60%] shrink-0" : "min-w-0",
								)}
							>
								{row.label}
							</span>
							{row.detail && (
								<span className="min-w-0 truncate text-xs text-muted-foreground">
									{row.detail}
								</span>
							)}
							<span className="flex-1" />
							{row.checked && <LuCheck className="size-3.5 shrink-0" />}
							{row.hint && (
								<span className="w-3 shrink-0 text-center text-[11px] tabular-nums text-muted-foreground">
									{row.hint}
								</span>
							)}
						</button>
					</Fragment>
				))}
			</div>
		</div>
	);
}
