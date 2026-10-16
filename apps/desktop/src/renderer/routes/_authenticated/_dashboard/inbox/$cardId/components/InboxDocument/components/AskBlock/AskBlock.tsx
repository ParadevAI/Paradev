import { useLingui } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import { FocusFrame } from "../FocusFrame";
import { SettledLine } from "../SettledLine";
import { QuestionBlock } from "./components/QuestionBlock";

type DocumentBlocks = NonNullable<RouterOutputs["inbox"]["document"]["blocks"]>;
type AskBlockData = Extract<DocumentBlocks[number], { type: "ask" }>;
type Question = AskBlockData["ask"]["questions"][number];

interface AskBlockProps {
	block: AskBlockData;
	/** The answers given so far, by question id. */
	answers: Record<string, unknown>;
	/** Optional questions the reader passed over. */
	skipped: string[];
	/** True once the card is settled: an unanswered question reads as history. */
	done: boolean;
	pending: boolean;
	/** The question that has the card's focus, if one of these does. */
	focusedId: string | null;
	onFocus: (questionId: string) => void;
	onAnswer: (questionId: string, value: unknown) => void;
	onSkip: (questionId: string) => void;
}

/** The questions an agent asks, each one answered and settled by itself. */
export function AskBlock({
	block,
	answers,
	skipped,
	done,
	pending,
	focusedId,
	onFocus,
	onAnswer,
	onSkip,
}: AskBlockProps) {
	const { t } = useLingui();
	const answerText = (question: Question): string => {
		const value = answers[question.id];
		if (value === undefined)
			return skipped.includes(question.id)
				? t({ message: "Skipped" })
				: t({ message: "Not answered" });
		if (typeof value === "boolean")
			return value ? t({ message: "Yes" }) : t({ message: "No" });
		const label = (id: unknown) =>
			question.options?.find((option) => option.id === id)?.label ?? String(id);
		return Array.isArray(value) ? value.map(label).join(", ") : label(value);
	};

	return (
		<div className="flex flex-col gap-3">
			{block.ask.questions.map((question) => {
				const settled =
					done || question.id in answers || skipped.includes(question.id);
				return settled ? (
					<SettledLine
						key={question.id}
						label={question.prompt}
						outcome={answerText(question)}
					>
						{null}
					</SettledLine>
				) : (
					<FocusFrame
						key={question.id}
						unitKey={`question:${question.id}`}
						focused={focusedId === question.id}
						onFocus={() => onFocus(question.id)}
					>
						<QuestionBlock
							question={question}
							focused={focusedId === question.id}
							pending={pending}
							onAnswer={(value) => onAnswer(question.id, value)}
							onSkip={() => onSkip(question.id)}
						/>
					</FocusFrame>
				);
			})}
		</div>
	);
}
