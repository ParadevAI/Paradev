import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuChevronRight } from "react-icons/lu";

interface DecisionRowProps {
	options: readonly string[];
	/** What each option says past its title, in the same order; a row with one shows it under the title. */
	details?: readonly (string | null)[];
	className?: string;
	/** Sends the chosen option as the person's reply. */
	onAnswer: (option: string) => void;
}

/**
 * The choices a reply offered, one row each: the title in bold, what it means
 * beneath. One click answers; the rows stay, the chosen one marked, until the
 * reply lands in the conversation.
 */
export function DecisionRow({
	options,
	details,
	className,
	onAnswer,
}: DecisionRowProps) {
	const [chosen, setChosen] = useState<string | null>(null);
	const described = details?.some((detail) => detail) ?? false;
	if (!described) {
		return (
			<div className={cn("flex flex-wrap gap-1.5", className)}>
				{options.map((option) => (
					<button
						key={option}
						type="button"
						disabled={chosen !== null}
						onClick={() => {
							setChosen(option);
							onAnswer(option);
						}}
						className={cn(
							"h-7 max-w-full truncate rounded-md border px-2.5 text-[12px] font-medium transition-colors",
							chosen === option
								? "border-transparent bg-foreground text-background"
								: "border-border bg-background text-foreground hover:bg-fill-hover disabled:opacity-40",
						)}
					>
						{option}
					</button>
				))}
			</div>
		);
	}
	return (
		<div
			className={cn(
				"flex flex-col divide-y divide-border overflow-hidden rounded-[10px] border border-border border-l-2 border-l-foreground/40",
				className,
			)}
		>
			{options.map((option, index) => (
				<button
					key={option}
					type="button"
					disabled={chosen !== null}
					onClick={() => {
						setChosen(option);
						onAnswer(option);
					}}
					className={cn(
						"group flex w-full items-center gap-3 py-2 pr-2.5 pl-3 text-left transition-colors",
						chosen === option
							? "bg-fill-selected"
							: "bg-background hover:bg-fill-hover disabled:opacity-40",
					)}
				>
					<span className="flex min-w-0 flex-1 flex-col gap-0.5">
						<span className="text-[13px] leading-[18px] font-semibold">
							{option}
						</span>
						{details?.[index] && (
							<span className="text-[12px] leading-4 text-muted-foreground">
								{details[index]}
							</span>
						)}
					</span>
					<LuChevronRight className="size-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-px" />
				</button>
			))}
		</div>
	);
}
