import { cn } from "@superset/ui/utils";

export type ViewToggleOption<Value extends string> = {
	value: Value;
	label: string;
};

/** Two views of one block, such as code and the picture drawn from it. */
export function ViewToggle<Value extends string>({
	className,
	label,
	onChange,
	options,
	value,
}: {
	/** Names the pair for assistive technology. */
	label: string;
	options: readonly [ViewToggleOption<Value>, ViewToggleOption<Value>];
	value: Value;
	onChange: (value: Value) => void;
	className?: string;
}) {
	return (
		<fieldset
			aria-label={label}
			className={cn(
				"m-0 flex h-6 min-w-0 shrink-0 items-center gap-0.5 rounded-md border-0 bg-foreground/[0.06] p-0.5 text-xs",
				className,
			)}
		>
			{options.map((option) => {
				const selected = option.value === value;
				return (
					<button
						aria-pressed={selected}
						className={cn(
							"rounded-[5px] px-2 leading-5 text-foreground/55 transition-colors hover:text-foreground",
							selected && "bg-background text-foreground shadow-xs",
						)}
						key={option.value}
						onClick={() => onChange(option.value)}
						type="button"
					>
						{option.label}
					</button>
				);
			})}
		</fieldset>
	);
}
