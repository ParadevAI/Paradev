import { Trans } from "@lingui/react/macro";
import { Input } from "@superset/ui/input";
import { Textarea } from "@superset/ui/textarea";
import { StripeField } from "../../../StripeField";
import { StripeTag } from "../../../StripeTag";

interface EvidenceFieldProps {
	label: string;
	value: string;
	onChange: (value: string) => void;
	/** A long field takes paragraphs; a short one takes a line. */
	long: boolean;
	maxLength: number;
	/** The text is the agent's and Stripe does not hold it yet. */
	drafted: boolean;
	/** The dispute takes no more evidence: the text is shown, not edited. */
	readOnly: boolean;
	disabled: boolean;
}

/** One field of the evidence a dispute response carries. */
export function EvidenceField({
	label,
	value,
	onChange,
	long,
	maxLength,
	drafted,
	readOnly,
	disabled,
}: EvidenceFieldProps) {
	const Control = long ? Textarea : Input;
	return (
		<StripeField
			label={label}
			tag={
				drafted && (
					<StripeTag tone="warn">
						<Trans>Drafted</Trans>
					</StripeTag>
				)
			}
		>
			{readOnly ? (
				<p className="whitespace-pre-wrap break-words text-[13px] text-foreground">
					{value || "–"}
				</p>
			) : (
				<Control
					value={value}
					onChange={(event) => onChange(event.target.value)}
					disabled={disabled}
					maxLength={maxLength}
					aria-label={label}
					className={
						long
							? "max-h-60 min-h-20 text-[13px] md:text-[13px]"
							: "h-8 text-[13px] md:text-[13px]"
					}
				/>
			)}
		</StripeField>
	);
}
