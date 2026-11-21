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
			<div ref={listRef} className="scroll-fade max-h-96 overflow-y-auto p-1.5">
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
								<p className="px-3 pt-2.5 pb-1 text-[13px] text-muted-foreground">
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
									"flex cursor-pointer select-none items-center gap-2.5 rounded-[10px] px-3 py-[5px] text-[15px] leading-[21px] transition-colors",
									startsGroup && group && "scroll-mt-9",
									selected
										? "bg-accent text-accent-foreground"
										: "text-foreground",
								)}
								onMouseMove={() => onHighlight(index)}
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => onSelect(command)}
							>
								<span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4">
									{command.icon ?? <SlashSquareIcon />}
								</span>
								<span className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
									<span className="shrink-0 font-medium">{command.title}</span>
									{command.hint && (
										<span className="max-w-[40%] shrink-0 truncate text-muted-foreground">
											{command.hint}
										</span>
									)}
									{command.description && (
										<span className="min-w-0 truncate text-muted-foreground">
											{command.description}
										</span>
									)}
								</span>
								{command.rightIcon && (
									<span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
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
