import { cn } from "@superset/ui/utils";
import { RevealRow } from "../RevealRow";
import { SketchBar } from "../SketchBar";

export function TerminalSketch({ active }: { active: boolean }) {
	const dim = active ? "text-foreground/45" : "text-foreground/25";

	return (
		<div
			key={String(active)}
			className="flex min-h-0 flex-1 flex-col gap-2 px-3 py-2.5 font-mono text-[9.5px] leading-none"
		>
			<RevealRow
				play={active}
				index={0}
				className={cn(
					"flex items-center gap-1.5 self-start rounded-[3px] border px-2 py-1.5 transition-colors duration-500",
					active ? "border-[#d97757]" : "border-foreground/20",
				)}
			>
				<span className={active ? "text-[#d97757]" : "text-foreground/30"}>
					✻
				</span>
				<span className={active ? "text-foreground/85" : "text-foreground/35"}>
					Claude Code
				</span>
			</RevealRow>
			<RevealRow
				play={active}
				index={1}
				className={cn(
					"flex items-center gap-1.5 px-1 py-1 transition-colors duration-500",
					active ? "bg-foreground/10" : "bg-foreground/[0.05]",
				)}
			>
				<span className={dim}>❯</span>
				<SketchBar
					width="58%"
					className={cn(
						"h-1 rounded-none",
						active ? "bg-foreground/50" : "bg-foreground/15",
					)}
				/>
			</RevealRow>
			<RevealRow play={active} index={2} className="flex flex-col gap-1.5">
				<div className="flex items-center gap-1.5">
					<span
						className={active ? "text-foreground/85" : "text-foreground/30"}
					>
						●
					</span>
					<SketchBar
						width="64%"
						className="h-1 rounded-none bg-foreground/15"
					/>
				</div>
				<div className="flex items-center gap-1.5 pl-2.5">
					<span className={dim}>⎿</span>
					<span
						className={cn(
							"transition-colors duration-500",
							active ? "text-success" : "text-foreground/30",
						)}
					>
						✓ 12 passed
					</span>
				</div>
			</RevealRow>
			<RevealRow play={active} index={3} className="mt-auto">
				<div className="h-px bg-foreground/20" />
				<div className="flex items-center gap-1.5 py-1.5">
					<span className={dim}>❯</span>
					<span
						className={cn(
							"block h-2.5 w-1.5 transition-colors duration-500",
							active
								? "animate-pulse bg-foreground/75 motion-reduce:animate-none"
								: "bg-foreground/20",
						)}
					/>
				</div>
				<div className="h-px bg-foreground/20" />
			</RevealRow>
		</div>
	);
}
