import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { BrandMark } from "renderer/routes/_authenticated/_dashboard/components/BrandMark";
import { useSlashText } from "../../hooks/useSlashText";
import type { SlashEntry } from "../../utils/slashCommands";

interface SlashCommandMenuProps {
	entries: SlashEntry[];
	selected: number;
	onHover: (index: number) => void;
	onPick: (entry: SlashEntry) => void;
}

/** Slack's `/` menu: its built-in commands, greyed where they only work in Slack, then the shortcuts that run here. */
export function SlashCommandMenu({
	entries,
	selected,
	onHover,
	onPick,
}: SlashCommandMenuProps) {
	const text = useSlashText();

	return (
		<div
			role="listbox"
			className="absolute right-0 bottom-full left-0 mb-1.5 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
		>
			{entries.length === 0 ? (
				<div className="px-3 py-2 text-xs text-muted-foreground">
					<Trans>No matching commands</Trans>
				</div>
			) : (
				entries.map((entry, index) => {
					const unavailable =
						entry.kind === "command" ? entry.unavailable : undefined;
					return (
						<button
							key={entry.kind === "command" ? entry.name : entry.shortcut}
							type="button"
							role="option"
							aria-selected={index === selected}
							aria-disabled={unavailable ? true : undefined}
							onMouseDown={(event) => event.preventDefault()}
							onMouseEnter={() => onHover(index)}
							onClick={() => onPick(entry)}
							className={cn(
								"flex w-full items-start gap-2.5 rounded-md px-2.5 py-1.5 text-left",
								index === selected && "bg-fill-selected",
							)}
						>
							<BrandMark
								brand="slack"
								className={cn(
									"mt-0.5 size-5 shrink-0",
									unavailable && "opacity-50",
								)}
							/>
							{entry.kind === "command" ? (
								<span className={cn("min-w-0", unavailable && "opacity-60")}>
									<span className="block truncate text-[13px] font-semibold text-foreground">
										/{entry.name}
										{text.commands[entry.name].args && (
											<span className="font-normal">
												{" "}
												{text.commands[entry.name].args}
											</span>
										)}
									</span>
									<span className="block truncate text-xs text-muted-foreground">
										{unavailable ? (
											text.unavailable[unavailable]
										) : (
											<>
												<Trans>Slack</Trans> · {text.commands[entry.name].does}
											</>
										)}
									</span>
								</span>
							) : (
								<span className="min-w-0">
									<span className="block truncate text-[13px] text-foreground">
										{text.shortcuts[entry.shortcut]}
									</span>
									<span className="block truncate text-xs text-muted-foreground">
										<Trans>Slack</Trans>
									</span>
								</span>
							)}
						</button>
					);
				})
			)}
		</div>
	);
}
