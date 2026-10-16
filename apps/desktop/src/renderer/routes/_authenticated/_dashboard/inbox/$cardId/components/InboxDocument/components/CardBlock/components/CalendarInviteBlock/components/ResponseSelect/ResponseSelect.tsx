import { useLingui } from "@lingui/react/macro";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import type { CalendarAnswer } from "../../../../types";

const ANSWERS: CalendarAnswer[] = ["accepted", "declined", "tentative"];

interface ResponseSelectProps {
	value: CalendarAnswer | null;
	onChange: (value: CalendarAnswer) => void;
	disabled?: boolean;
}

/** Google's Yes / No / Maybe menu, reading "Going?" until an answer is chosen and "RSVP: Maybe" after. */
export function ResponseSelect({
	value,
	onChange,
	disabled,
}: ResponseSelectProps) {
	const { t } = useLingui();
	const labels: Record<CalendarAnswer, string> = {
		accepted: t({ message: "Yes" }),
		declined: t({ message: "No" }),
		tentative: t({ message: "Maybe" }),
	};
	const rsvpLabels: Record<CalendarAnswer, string> = {
		accepted: t({ message: "RSVP: Yes" }),
		declined: t({ message: "RSVP: No" }),
		tentative: t({ message: "RSVP: Maybe" }),
	};
	return (
		<Select
			value={value ?? ""}
			onValueChange={(next) => onChange(next as CalendarAnswer)}
			disabled={disabled}
		>
			<SelectTrigger
				size="sm"
				aria-label={t({ message: "Going?" })}
				className="w-fit text-[13px]"
			>
				{value ? (
					<span>{rsvpLabels[value]}</span>
				) : (
					<SelectValue placeholder={t({ message: "Going?" })} />
				)}
			</SelectTrigger>
			<SelectContent>
				{ANSWERS.map((answer) => (
					<SelectItem key={answer} value={answer}>
						{labels[answer]}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
