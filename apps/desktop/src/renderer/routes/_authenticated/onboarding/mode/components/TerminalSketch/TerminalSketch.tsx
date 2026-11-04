import { cn } from "@superset/ui/utils";
import { RevealRow } from "../RevealRow";
import { SketchBar } from "../SketchBar";

export function TerminalSketch({ active }: { active: boolean }) {
	const prompt = cn(
		"transition-colors duration-500",
		active ? "text-success" : "text-foreground/30",
	);

	return (
		<div
			key={String(active)}
			className="flex min-h-0 flex-1 flex-col gap-2.5 p-4 font-mono text-[10px] leading-none"
		>
			<RevealRow play={active} index={0} className="flex items-center gap-2">
				<span className={prompt}>❯</span>
				<span className={active ? "text-foreground/85" : "text-foreground/40"}>
					claude
				</span>
			</RevealRow>
			<RevealRow play={active} index={1} className="flex flex-col gap-2 pl-4">
				<SketchBar width="58%" className="bg-foreground/10" />
				<SketchBar width="42%" className="bg-foreground/10" />
			</RevealRow>
			<RevealRow
				play={active}
				index={2}
				className={cn(
					"pl-4 transition-colors duration-500",
					active ? "text-success" : "text-foreground/30",
				)}
			>
				✓ 12 passed
			</RevealRow>
			<RevealRow play={active} index={3} className="flex items-center gap-2">
				<span className={prompt}>❯</span>
				<span
					className={cn(
						"block h-3 w-1.5 rounded-[1px] transition-colors duration-500",
						active
							? "animate-pulse bg-foreground/70 motion-reduce:animate-none"
							: "bg-foreground/20",
					)}
				/>
			</RevealRow>
		</div>
	);
}
