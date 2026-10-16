interface StripeSelectProps<T extends string> {
	label: string;
	value: T;
	onChange: (value: T) => void;
	options: { value: T; label: string }[];
	disabled?: boolean;
}

/** A plain select, as Stripe's dialogs use. */
export function StripeSelect<T extends string>({
	label,
	value,
	onChange,
	options,
	disabled,
}: StripeSelectProps<T>) {
	return (
		<select
			aria-label={label}
			value={value}
			disabled={disabled}
			onChange={(event) => onChange(event.target.value as T)}
			className="h-8 w-fit max-w-full rounded-md border border-input bg-transparent px-2 text-[13px] text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
		>
			{options.map((option) => (
				<option key={option.value} value={option.value}>
					{option.label}
				</option>
			))}
		</select>
	);
}
