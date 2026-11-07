import { cn } from "@superset/ui/utils";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { LuCheck } from "react-icons/lu";

interface ModeCardProps {
	name: string;
	title: string;
	sketch: ReactNode;
	selected: boolean;
	onSelect: () => void;
}

export function ModeCard({
	name,
	title,
	sketch,
	selected,
	onSelect,
}: ModeCardProps) {
	const reduceMotion = useReducedMotion();

	return (
		<label
			className={cn(
				"group flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-xl border transition-[border-color,box-shadow] duration-300 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
				selected
					? "border-foreground/60 ring-1 ring-foreground/60"
					: "border-border hover:border-foreground/25",
			)}
		>
			<input
				type="radio"
				name={name}
				checked={selected}
				onChange={onSelect}
				className="sr-only"
			/>
			<div
				className={cn(
					"relative aspect-[3/2] overflow-hidden border-b transition-colors duration-500",
					selected
						? "border-border bg-foreground/[0.06]"
						: "border-border/60 bg-foreground/[0.03]",
				)}
			>
				<div
					aria-hidden
					className={cn(
						"absolute inset-x-4 top-4 -bottom-px flex flex-col overflow-hidden rounded-t-lg border border-b-0 bg-background transition-[border-color,opacity] duration-500",
						selected
							? "border-border opacity-100"
							: "border-border/70 opacity-70 group-hover:opacity-90",
					)}
				>
					{sketch}
				</div>
			</div>
			<div className="flex items-center justify-between px-4 py-3">
				<span
					className={cn(
						"font-medium text-sm transition-colors duration-300",
						selected ? "text-foreground" : "text-muted-foreground",
					)}
				>
					{title}
				</span>
				<span
					className={cn(
						"flex size-4 items-center justify-center rounded-full border transition-colors duration-300",
						selected
							? "border-transparent bg-foreground"
							: "border-muted-foreground/40",
					)}
				>
					{selected && (
						<motion.span
							initial={reduceMotion ? false : { scale: 0 }}
							animate={{ scale: 1 }}
							transition={{ type: "spring", stiffness: 520, damping: 24 }}
							className="flex"
						>
							<LuCheck className="size-2.5 stroke-[4] text-background" />
						</motion.span>
					)}
				</span>
			</div>
		</label>
	);
}
