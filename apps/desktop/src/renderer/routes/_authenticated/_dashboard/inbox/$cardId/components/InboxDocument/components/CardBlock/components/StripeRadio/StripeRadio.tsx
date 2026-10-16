import { RadioGroup, RadioGroupItem } from "@superset/ui/radio-group";
import { type ReactNode, useId } from "react";

interface StripeRadioOption<T extends string> {
	value: T;
	label: string;
	/** Drawn after the label, on its line. */
	detail?: ReactNode;
	/** Drawn under the label, such as the date an option stands for. */
	description?: ReactNode;
	/** A control that belongs to the option, drawn under its description. */
	control?: ReactNode;
}

interface StripeRadioProps<T extends string> {
	label: string;
	value: T;
	onChange: (value: T) => void;
	options: StripeRadioOption<T>[];
	disabled?: boolean;
}

/** One choice from a short list, each on its own line. */
export function StripeRadio<T extends string>({
	label,
	value,
	onChange,
	options,
	disabled,
}: StripeRadioProps<T>) {
	const id = useId();
	return (
		<RadioGroup
			aria-label={label}
			value={value}
			onValueChange={(next) => onChange(next as T)}
			disabled={disabled}
			className="gap-2"
		>
			{options.map((option) => (
				<div
					key={option.value}
					className="flex items-start gap-2 text-[13px] text-foreground"
				>
					<RadioGroupItem
						id={`${id}-${option.value}`}
						value={option.value}
						aria-label={option.label}
						className="mt-0.5"
					/>
					<div className="flex min-w-0 flex-col gap-0.5">
						<div className="flex flex-wrap gap-x-2">
							<label htmlFor={`${id}-${option.value}`}>{option.label}</label>
							{option.detail && (
								<span className="text-muted-foreground">{option.detail}</span>
							)}
						</div>
						{option.description && (
							<span className="text-xs text-muted-foreground">
								{option.description}
							</span>
						)}
						{option.control && <div className="pt-1">{option.control}</div>}
					</div>
				</div>
			))}
		</RadioGroup>
	);
}
