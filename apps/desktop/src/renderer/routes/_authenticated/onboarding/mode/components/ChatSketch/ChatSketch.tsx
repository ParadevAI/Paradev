import { cn } from "@superset/ui/utils";
import { LuArrowUp } from "react-icons/lu";
import { RevealRow } from "../RevealRow";
import { SketchBar } from "../SketchBar";

export function ChatSketch({ active }: { active: boolean }) {
	return (
		<div
			key={String(active)}
			className="flex min-h-0 flex-1 flex-col gap-2 p-3"
		>
			<RevealRow
				play={active}
				index={0}
				className={cn(
					"flex h-5 w-[42%] items-center self-end rounded-md px-2 transition-colors duration-500",
					active ? "bg-foreground/15" : "bg-foreground/[0.07]",
				)}
			>
				<SketchBar
					width="72%"
					className={active ? "bg-foreground/45" : undefined}
				/>
			</RevealRow>
			<RevealRow play={active} index={1}>
				<SketchBar width="64%" className="bg-foreground/10" />
			</RevealRow>
			<RevealRow
				play={active}
				index={2}
				className="w-[74%] shrink-0 overflow-hidden rounded-md border border-border/80"
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
				<div className="flex flex-col gap-1.5 p-2">
					<SketchBar
						width="56%"
						className={active ? "bg-destructive/60" : "bg-foreground/12"}
					/>
					<SketchBar
						width="68%"
						className={active ? "bg-success/60" : "bg-foreground/12"}
					/>
				</div>
			</RevealRow>
			<RevealRow
				play={active}
				index={3}
				className="mt-auto flex h-7 shrink-0 items-center justify-between rounded-lg border border-border/80 pr-1 pl-2.5"
			>
				<SketchBar width="34%" className="bg-foreground/10" />
				<span
					className={cn(
						"flex size-5 items-center justify-center rounded-full transition-colors duration-500",
						active
							? "bg-foreground text-background"
							: "bg-foreground/10 text-foreground/30",
					)}
				>
					<LuArrowUp className="size-3" />
				</span>
			</RevealRow>
		</div>
	);
}
