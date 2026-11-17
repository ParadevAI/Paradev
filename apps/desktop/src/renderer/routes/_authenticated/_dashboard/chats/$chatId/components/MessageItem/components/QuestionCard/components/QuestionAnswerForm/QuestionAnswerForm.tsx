import { Trans, useLingui } from "@lingui/react/macro";
import type { Question } from "@superset/chats-core";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useState } from "react";
import { LuSendHorizontal } from "react-icons/lu";

interface QuestionAnswerFormProps {
	question: Question;
	/** Shows the choices without taking an answer: the question is for someone else. */
	isReadOnly?: boolean;
	onAnswer: (answer: string, typed: boolean) => void;
}

/** The answers a question takes: its options (and "Other…" with a field), Yes / No, or a field. */
export function QuestionAnswerForm({
	question,
	isReadOnly,
	onAnswer,
}: QuestionAnswerFormProps) {
	const { t } = useLingui();
	const [isTyping, setTyping] = useState(question.kind === "input");
	const [text, setText] = useState("");

	if (question.kind === "confirm") {
		return (
			<div className="flex gap-2">
				<Button
					size="sm"
					disabled={isReadOnly}
					className="min-w-16"
					onClick={() => onAnswer("yes", false)}
				>
					<Trans>Yes</Trans>
				</Button>
				<Button
					size="sm"
					disabled={isReadOnly}
					variant="outline"
					className="min-w-16"
					onClick={() => onAnswer("no", false)}
				>
					<Trans>No</Trans>
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-1.5">
			{question.options.map((option) => (
				<Button
					key={option.label}
					variant="outline"
					disabled={isReadOnly}
					className="h-auto flex-col items-start gap-0.5 whitespace-normal py-2 text-left"
					onClick={() => onAnswer(option.label, false)}
				>
					<span className="font-medium text-sm">{option.label}</span>
					{option.description && (
						<span className="text-muted-foreground text-xs">
							{option.description}
						</span>
					)}
				</Button>
			))}
			{question.allowOther && !isTyping && (
				<Button
					variant="ghost"
					disabled={isReadOnly}
					className="justify-start text-muted-foreground"
					onClick={() => setTyping(true)}
				>
					<Trans>Other…</Trans>
				</Button>
			)}
			{isTyping && !isReadOnly && (
				<form
					className="flex items-center gap-1.5"
					onSubmit={(event) => {
						event.preventDefault();
						if (text.trim()) onAnswer(text.trim(), true);
					}}
				>
					<Input
						autoFocus={question.kind !== "input"}
						value={text}
						onChange={(event) => setText(event.target.value)}
						placeholder={question.placeholder || t({ message: "Your answer" })}
						aria-label={t({ message: "Your answer" })}
						className="text-sm"
					/>
					<Button
						type="submit"
						size="icon"
						aria-label={t({ message: "Send answer" })}
						disabled={!text.trim()}
						className="shrink-0"
					>
						<LuSendHorizontal className="size-4" />
					</Button>
				</form>
			)}
		</div>
	);
}
