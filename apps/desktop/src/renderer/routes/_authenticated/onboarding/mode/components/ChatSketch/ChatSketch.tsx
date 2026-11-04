import { claudeIcon } from "@superset/ui/icons/preset-icons";
import { cn } from "@superset/ui/utils";
import { LuArrowUp, LuPlus, LuSquareTerminal } from "react-icons/lu";
import { RevealRow } from "../RevealRow";
import { SketchBar } from "../SketchBar";

export function ChatSketch({ active }: { active: boolean }) {
	return (
		<div
			key={String(active)}
			className="flex min-h-0 flex-1 flex-col gap-2 px-3 py-2.5"
		>
			<RevealRow
				play={active}
				index={0}
				className={cn(
					"flex h-5 w-[46%] items-center self-end rounded-full px-2.5 transition-colors duration-500",
					active ? "bg-foreground/15" : "bg-foreground/[0.07]",
				)}
			>
				<SketchBar
					width="78%"
					className={active ? "bg-foreground/45" : undefined}
				/>
			</RevealRow>
			<RevealRow play={active} index={1} className="flex flex-col gap-1.5">
				<div
					className={cn(
						"flex items-center gap-1 text-[9px] transition-colors duration-500",
						active ? "text-foreground/40" : "text-foreground/25",
					)}
				>
					<LuSquareTerminal className="size-2.5" />
					<SketchBar width="34%" className="h-1 bg-foreground/12" />
				</div>
				<SketchBar width="74%" className="bg-foreground/15" />
			</RevealRow>
			<RevealRow
				play={active}
				index={2}
				className="w-[78%] shrink-0 overflow-hidden rounded-lg border border-border/80"
			>
				<div className="flex items-center gap-1.5 border-border/80 border-b px-2 py-1 font-mono text-[9px] leading-none">
					<span
						className={active ? "text-foreground/80" : "text-foreground/35"}
					>
						session.ts
					</span>
					<span className={active ? "text-success" : "text-foreground/30"}>
						+21
					</span>
					<span className={active ? "text-destructive" : "text-foreground/30"}>
						−8
					</span>
				</div>
				<div className="flex flex-col">
					<span
						className={cn(
							"flex h-3 items-center px-2 transition-colors duration-500",
							active ? "bg-destructive/15" : "bg-transparent",
						)}
					>
						<SketchBar
							width="52%"
							className={cn(
								"h-1",
								active ? "bg-destructive/60" : "bg-foreground/12",
							)}
						/>
					</span>
					<span
						className={cn(
							"flex h-3 items-center px-2 transition-colors duration-500",
							active ? "bg-success/15" : "bg-transparent",
						)}
					>
						<SketchBar
							width="64%"
							className={cn(
								"h-1",
								active ? "bg-success/60" : "bg-foreground/12",
							)}
						/>
					</span>
				</div>
			</RevealRow>
			<RevealRow
				play={active}
				index={3}
				className="mt-auto flex shrink-0 items-center gap-1.5 rounded-xl border border-border/80 py-1 pr-1 pl-2"
			>
				<LuPlus
					className={cn(
						"size-2.5",
						active ? "text-foreground/50" : "text-foreground/25",
					)}
				/>
				<SketchBar width="30%" className="h-1 bg-foreground/10" />
				<span className="ml-auto flex items-center gap-1">
					<img
						src={claudeIcon}
						alt=""
						className={cn(
							"size-2.5 transition-[filter] duration-500",
							!active && "grayscale",
						)}
					/>
					<span
						className={cn(
							"flex size-4 items-center justify-center rounded-full transition-colors duration-500",
							active
								? "bg-foreground text-background"
								: "bg-foreground/10 text-foreground/30",
						)}
					>
						<LuArrowUp className="size-2.5" />
					</span>
				</span>
			</RevealRow>
		</div>
	);
}
