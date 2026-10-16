import { Input } from "@superset/ui/input";

interface StripeMoneyFieldProps {
	label: string;
	/** The typed text, in the currency's main unit. */
	value: string;
	onChange: (value: string) => void;
	currency: string;
	disabled?: boolean;
	invalid?: boolean;
	/** What is wrong with the amount, drawn under it. */
	error?: string | null;
}

/** An amount of money to type, with its currency after it. */
export function StripeMoneyField({
	label,
	value,
	onChange,
	currency,
	disabled,
	invalid,
	error,
}: StripeMoneyFieldProps) {
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-center gap-2">
				<Input
					aria-label={label}
					aria-invalid={invalid || Boolean(error) || undefined}
					inputMode="decimal"
					value={value}
					disabled={disabled}
					onChange={(event) => onChange(event.target.value)}
					className="h-8 w-32 text-[13px] tabular-nums md:text-[13px]"
				/>
				<span className="text-xs text-muted-foreground">
					{currency.toUpperCase()}
				</span>
			</div>
			{error && <p className="text-xs text-destructive">{error}</p>}
		</div>
	);
}
