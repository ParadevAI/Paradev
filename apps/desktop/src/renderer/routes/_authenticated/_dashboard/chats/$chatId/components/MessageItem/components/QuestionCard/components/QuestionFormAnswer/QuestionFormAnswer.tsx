import { Trans, useLingui } from "@lingui/react/macro";
import {
	checkFormAnswers,
	type Question,
	type QuestionPartAnswer,
	setTyped,
	togglePick,
} from "@superset/chats-core";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { cn } from "@superset/ui/utils";
import { LuCheck, LuCircle, LuCircleCheck, LuSquare } from "react-icons/lu";

const MAX_TYPED = 2_000;

interface QuestionFormAnswerProps {
	question: Question;
	/** Shows the questions and options without taking an answer. */
	isReadOnly?: boolean;
	/** What is picked and typed so far, one per part; kept by the card. */
	answers: QuestionPartAnswer[];
	onChange: (answers: QuestionPartAnswer[]) => void;
	onAnswer: (answers: QuestionPartAnswer[]) => void;
}

/** A form's answers: each question with its options to pick, a field for "Other…", and one Send for them all. */
export function QuestionFormAnswer({
	question,
	isReadOnly,
	answers,
	onChange,
	onAnswer,
}: QuestionFormAnswerProps) {
	const { t } = useLingui();
	const parts = question.parts ?? [];
	const checked = checkFormAnswers(parts, answers);
	const change = (index: number, answer: QuestionPartAnswer) =>
		onChange(answers.map((current, at) => (at === index ? answer : current)));

	return (
		<div className="flex flex-col gap-3">
			{parts.map((part, index) => {
				const answer = answers[index] ?? { picked: [], typed: null };
				const Unpicked = part.multiSelect ? LuSquare : LuCircle;
				const Picked = part.multiSelect ? LuCheck : LuCircleCheck;
				return (
					<fieldset
						key={part.title}
						className="flex flex-col gap-1.5"
						disabled={isReadOnly}
					>
						{parts.length > 1 && (
							<legend className="mb-1.5 flex flex-col gap-0.5">
								{part.header && (
									<span className="font-medium text-muted-foreground text-xs">
										{part.header}
									</span>
								)}
								<span className="whitespace-pre-wrap font-medium text-sm">
									{part.title}
								</span>
							</legend>
						)}
						{part.multiSelect && (
							<span className="text-muted-foreground text-xs">
								<Trans>Pick any</Trans>
							</span>
						)}
						{part.options.map((option) => {
							const isOn = answer.picked.includes(option.label);
							const Mark = isOn ? Picked : Unpicked;
							return (
								<Button
									key={option.label}
									variant="ghost"
									role={part.multiSelect ? "checkbox" : "radio"}
									aria-checked={isOn}
									className={cn(
										"h-auto items-start justify-start gap-2 whitespace-normal rounded-lg bg-background/50 py-2 text-left hover:bg-background/80",
										isOn && "bg-highlight/15 hover:bg-highlight/20",
									)}
									onClick={() =>
										change(index, togglePick(part, answer, option.label))
									}
								>
									<Mark
										className={cn(
											"mt-0.5 size-3.5",
											isOn ? "text-highlight" : "text-muted-foreground",
										)}
									/>
									<span className="flex flex-col gap-0.5">
										<span className="font-medium text-sm">{option.label}</span>
										{option.description && (
											<span className="text-muted-foreground text-xs">
												{option.description}
											</span>
										)}
									</span>
								</Button>
							);
						})}
						{part.allowOther && !isReadOnly && (
							<Input
								value={answer.typed ?? ""}
								onChange={(event) =>
									change(index, setTyped(part, answer, event.target.value))
								}
								placeholder={t({ message: "Other…" })}
								maxLength={MAX_TYPED}
								className="text-sm"
							/>
						)}
					</fieldset>
				);
			})}
			{!isReadOnly && (
				<Button
					size="sm"
					className="self-start"
					disabled={"problem" in checked}
					onClick={() => "answers" in checked && onAnswer(checked.answers)}
				>
					{parts.length > 1 ? <Trans>Send answers</Trans> : <Trans>Send</Trans>}
				</Button>
			)}
		</div>
	);
}
