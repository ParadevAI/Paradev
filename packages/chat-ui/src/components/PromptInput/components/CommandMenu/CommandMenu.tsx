"use client";

import { cn } from "@superset/ui/utils";
import { SlashSquareIcon } from "lucide-react";
import { Fragment, useEffect, useRef } from "react";
import type { PromptInputCommand } from "../../types";

export type CommandMenuProps = {
	commands: PromptInputCommand[];
	selectedIndex: number | null;
	onHighlight: (index: number) => void;
	onSelect: (command: PromptInputCommand) => void;
};

export function CommandMenu({
	commands,
	selectedIndex,
	onHighlight,
	onSelect,
}: CommandMenuProps) {
	const listRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (selectedIndex == null) return;
		listRef.current
			?.querySelector(`[data-index="${selectedIndex}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [selectedIndex]);

	if (commands.length === 0) return null;
	let previousGroup: string | null = null;
	return (
		<div
			role="listbox"
			className="relative z-50 w-full overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-[0_6px_24px_-10px_rgba(0,0,0,0.3)]"
		>
			<div ref={listRef} className="scroll-fade max-h-72 overflow-y-auto p-1">
				{commands.map((command, index) => {
					const group = command.group ?? null;
					const startsGroup = group !== previousGroup;
					previousGroup = group;
					const selected = index === selectedIndex;
					return (
						<Fragment key={command.id}>
							{startsGroup && index > 0 && (
								<div className="mx-1 my-0.5 h-px bg-border" />
							)}
							{startsGroup && group && (
								<p className="px-2 pt-1 pb-0.5 text-muted-foreground/60 text-xs">
									{group}
								</p>
							)}
							{/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by the editor */}
							{/* biome-ignore lint/a11y/useFocusableInteractive: focus stays in the editor; listbox is virtual */}
							<div
								role="option"
								data-index={index}
								aria-selected={selected}
								className={cn(
									"flex cursor-pointer select-none items-center gap-2 rounded-xl px-2 py-1 text-xs leading-[18px] transition-colors",
									startsGroup && group && "scroll-mt-7",
									selected && "bg-accent text-accent-foreground",
								)}
								onMouseMove={() => onHighlight(index)}
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => onSelect(command)}
							>
								<span
									className={cn(
										"flex size-4 shrink-0 items-center justify-center text-muted-foreground/60 [&_svg]:size-3.5",
										selected && "text-foreground/70",
									)}
								>
									{command.icon ?? <SlashSquareIcon />}
								</span>
								<span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
									<span className="shrink-0 font-medium text-foreground/80">
										{command.title}
									</span>
									{command.hint && (
										<span className="max-w-[40%] shrink-0 truncate text-muted-foreground/70">
											{command.hint}
										</span>
									)}
									{command.description && (
										<span className="min-w-0 truncate pl-1 text-muted-foreground/55">
											{command.description}
										</span>
									)}
								</span>
								{command.rightIcon && (
									<span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground/60">
										{command.rightIcon}
									</span>
								)}
							</div>
						</Fragment>
					);
				})}
			</div>
		</div>
	);
}
