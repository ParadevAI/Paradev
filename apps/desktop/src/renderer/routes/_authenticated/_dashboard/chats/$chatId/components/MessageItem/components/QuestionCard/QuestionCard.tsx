import { useLingui } from "@lingui/react/macro";
import {
	answeredSummary,
	type ChatState,
	emptyFormAnswers,
	formAnswerLines,
	type Question,
	type QuestionPartAnswer,
	questionCardState,
} from "@superset/chats-core";
import { useState } from "react";
import {
	LuChevronRight,
	LuCircleCheck,
	LuCircleSlash,
	LuClock,
	LuMessageCircleQuestion,
} from "react-icons/lu";
import { QuestionAnswerForm } from "./components/QuestionAnswerForm";
import { QuestionFormAnswer } from "./components/QuestionFormAnswer";

interface QuestionCardProps {
	state: ChatState;
	chatId: string;
	question: Question;
	onAnswer: (questionId: string, answer: string, typed: boolean) => void;
	onAnswerForm: (questionId: string, answers: QuestionPartAnswer[]) => void;
}

/**
 * A Dev's question in the thread: the options to answer it with while it is
 * open for the reader, who it waits on for everyone else, then, answered,
 * one slim line that opens to the whole card and folds back.
 */
export function QuestionCard({
	state,
	chatId,
	question,
	onAnswer,
	onAnswerForm,
}: QuestionCardProps) {
	const { t } = useLingui();
	const card = questionCardState(state, chatId, question);
	const [draft, setDraft] = useState(() =>
		emptyFormAnswers(question.parts ?? []),
	);
	const [isUnfolded, setUnfolded] = useState(false);
	const audience = !question.forUserId
		? t({ message: "Asking anyone here" })
		: question.forUserId === state.meId
			? t({ message: "Asking you" })
			: t({
					message: `Asking ${state.members[question.forUserId]?.name ?? "someone"}`,
				});
	const controls = (isReadOnly?: boolean) =>
		question.kind === "form" ? (
			<QuestionFormAnswer
				question={question}
				isReadOnly={isReadOnly}
				answers={draft}
				onChange={setDraft}
				onAnswer={(answers) => onAnswerForm(question.id, answers)}
			/>
		) : (
			<QuestionAnswerForm
				question={question}
				isReadOnly={isReadOnly}
				onAnswer={(answer, typed) => onAnswer(question.id, answer, typed)}
			/>
		);
	const isSeveral =
		question.kind === "form" && (question.parts?.length ?? 0) > 1;
	const answerLines = isSeveral ? formAnswerLines(question) : [];
	const answered = (line: string, canFold?: boolean) => (
		<div className="flex flex-col gap-1">
			{canFold ? (
				<button
					type="button"
					aria-expanded
					onClick={() => setUnfolded(false)}
					className="flex items-center gap-1.5 text-left text-sm"
				>
					<LuCircleCheck className="size-3.5 shrink-0 text-highlight" />
					{line}
					<LuChevronRight className="size-3 shrink-0 rotate-90 opacity-60" />
				</button>
			) : (
				<span className="flex items-center gap-1.5 text-sm">
					<LuCircleCheck className="size-3.5 shrink-0 text-highlight" />
					{line}
				</span>
			)}
			{answerLines.length > 0 && (
				<dl className="flex flex-col gap-1 pl-5 text-sm">
					{answerLines.map(({ header, answer }) => (
						<div key={header} className="flex gap-1.5">
							<dt className="shrink-0 text-muted-foreground">{header}</dt>
							<dd className="whitespace-pre-wrap">{answer}</dd>
						</div>
					))}
				</dl>
			)}
		</div>
	);

	if (card.kind === "answered" && !isUnfolded) {
		const { asked, line } = answeredSummary(state, question);
		return (
			<button
				type="button"
				aria-expanded={false}
				onClick={() => setUnfolded(true)}
				className="flex w-fit min-w-0 max-w-full items-center gap-1.5 text-left text-muted-foreground text-xs hover:text-foreground"
			>
				<LuCircleCheck className="size-3.5 shrink-0 text-highlight" />
				{asked && (
					<span className="min-w-0 shrink truncate font-medium text-foreground">
						{asked}
					</span>
				)}
				<span className="min-w-0 shrink-[2] truncate">
					{asked ? `· ${line}` : line}
				</span>
				<LuChevronRight className="size-3 shrink-0 opacity-60" />
			</button>
		);
	}

	return (
		<div className="flex w-full max-w-md flex-col gap-3 py-1">
			<div className="flex flex-col gap-1">
				<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
					<LuMessageCircleQuestion className="size-3.5 shrink-0" />
					{audience}
				</span>
				{!isSeveral && (
					<p className="whitespace-pre-wrap font-medium text-[15px] leading-snug">
						{question.title}
					</p>
				)}
				{question.body && question.kind !== "form" && (
					<p className="whitespace-pre-wrap text-muted-foreground text-sm">
						{question.body}
					</p>
				)}
			</div>
			{card.kind === "ask" && controls()}
			{card.kind === "waiting" && (
				<>
					{controls(true)}
					<span className="text-muted-foreground text-xs">{card.line}</span>
				</>
			)}
			{card.kind === "answered" && answered(card.line, true)}
			{card.kind === "expired" && (
				<>
					<span className="flex items-center gap-1.5 text-muted-foreground text-sm">
						<LuClock className="size-3.5 shrink-0" />
						{card.line}
					</span>
					{card.late && answered(card.late)}
					{card.canAnswer && controls()}
				</>
			)}
			{card.kind === "cancelled" && (
				<span className="flex items-center gap-1.5 text-muted-foreground text-sm">
					<LuCircleSlash className="size-3.5 shrink-0" />
					{card.line}
				</span>
			)}
		</div>
	);
}
