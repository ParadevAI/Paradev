import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";

export type Answer = "approve" | "deny";

interface AnswerChoiceProps {
	value: Answer;
	onChange: (value: Answer) => void;
	disabled: boolean;
}

const OPTION =
	"h-7 rounded-[5px] px-3 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 aria-checked:bg-background aria-checked:text-foreground aria-checked:shadow-xs";

/** Which answer the reply under it is for. */
export function AnswerChoice({ value, onChange, disabled }: AnswerChoiceProps) {
	const { t } = useLingui();
	const option = (answer: Answer) => ({
		type: "button" as const,
		role: "radio",
		"aria-checked": value === answer,
		disabled,
		onClick: () => onChange(answer),
		className: cn(OPTION),
	});
	return (
		<div
			role="radiogroup"
			aria-label={t({ message: "Answer" })}
			className="flex w-fit items-center gap-0.5 rounded-md bg-muted p-0.5"
		>
			<button {...option("approve")}>
				<Trans>Approve</Trans>
			</button>
			<button {...option("deny")}>
				<Trans>Deny</Trans>
			</button>
		</div>
	);
}
