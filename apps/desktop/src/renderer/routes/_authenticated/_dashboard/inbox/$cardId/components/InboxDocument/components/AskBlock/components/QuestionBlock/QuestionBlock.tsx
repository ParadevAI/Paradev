import { Trans, useLingui } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Textarea } from "@superset/ui/textarea";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuCheck } from "react-icons/lu";
import { ActionKeycap } from "../../../CardBlock/components/ActionKeycap";
import type { ActionKeySlot } from "../../../CardBlock/utils/assignActionKeys";

type DocumentBlocks = NonNullable<RouterOutputs["inbox"]["document"]["blocks"]>;
type AskBlockData = Extract<DocumentBlocks[number], { type: "ask" }>;
type Question = AskBlockData["ask"]["questions"][number];

interface QuestionBlockProps {
	question: Question;
	/** True while this question has the card's focus: its options and buttons answer to keys and draw them. */
	focused: boolean;
	pending: boolean;
	onAnswer: (value: unknown) => void;
	onSkip: () => void;
}

const OTHER = "__other__";
const SLOTS: ActionKeySlot[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** One question, answered by itself: pick with the number keys, send with the primary key, pass over an optional one with the "no" key. */
export function QuestionBlock({
	question,
	focused,
	pending,
	onAnswer,
	onSkip,
}: QuestionBlockProps) {
	const { t } = useLingui();
	const [draft, setDraft] = useState<unknown>(undefined);
	const [other, setOther] = useState("");
	const multi = question.kind === "multi_select";
	const picked = new Set<unknown>(
		multi ? (Array.isArray(draft) ? draft : []) : [draft],
	);
	const options =
		question.kind === "confirm"
			? [
					{ id: true, label: t({ message: "Yes" }), consequence: undefined },
					{ id: false, label: t({ message: "No" }), consequence: undefined },
				]
			: question.kind === "text"
				? []
				: [
						...(question.options ?? []),
						...(question.allow_other
							? [
									{
										id: OTHER,
										label: t({ message: "Something else" }),
										consequence: undefined,
									},
								]
							: []),
					];
	const pick = (id: unknown) => {
		if (!multi) return setDraft(id);
		const next = new Set(picked);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		setDraft([...next]);
	};
	const value = (() => {
		if (question.kind === "text")
			return typeof draft === "string" ? draft.trim() : "";
		if (multi)
			return [...picked]
				.map((id) => (id === OTHER ? other.trim() : id))
				.filter((id) => id !== "");
		return draft === OTHER ? other.trim() : draft;
	})();
	const blank =
		value === undefined ||
		value === "" ||
		(Array.isArray(value) && value.length === 0);
	const slot = (index: number) => (focused ? SLOTS[index] : undefined);

	return (
		<fieldset className="flex flex-col gap-2.5 rounded-lg border border-border bg-card px-5 py-4">
			<legend className="float-left mb-2 flex w-full items-baseline gap-2 text-sm font-medium text-foreground">
				{question.prompt}
				{question.optional && (
					<span className="text-xs font-normal text-muted-foreground">
						<Trans>optional</Trans>
					</span>
				)}
			</legend>
			{question.kind === "text" ? (
				<Textarea
					value={typeof draft === "string" ? draft : ""}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey))
							return;
						event.preventDefault();
						if (!blank && !pending) onAnswer(value);
					}}
					placeholder={t({ message: "Type your answer" })}
					aria-label={question.prompt}
					className="min-h-20 text-sm"
				/>
			) : (
				<div
					className={cn(
						"flex gap-1.5",
						question.kind === "confirm" ? "flex-row" : "flex-col",
					)}
				>
					{options.map((option, index) => {
						const selected = picked.has(option.id);
						return (
							<button
								key={String(option.id)}
								type="button"
								aria-pressed={selected}
								data-action-key={slot(index)}
								onClick={() => pick(option.id)}
								className={cn(
									"flex items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
									question.kind === "confirm" && "min-w-24 items-center",
									selected
										? "border-foreground/30 bg-fill-selected"
										: "border-border hover:bg-fill-hover",
								)}
							>
								{question.kind !== "confirm" && (
									<span
										aria-hidden
										className={cn(
											"mt-0.5 flex size-4 shrink-0 items-center justify-center border border-muted-foreground/50",
											multi ? "rounded-[4px]" : "rounded-full",
											selected &&
												"border-primary bg-primary text-primary-foreground",
										)}
									>
										{selected && <LuCheck className="size-3" strokeWidth={3} />}
									</span>
								)}
								<span className="flex min-w-0 flex-1 flex-col gap-0.5">
									<span className="text-sm text-foreground">
										{option.label}
									</span>
									{option.consequence && (
										<span className="text-xs text-muted-foreground">
											{option.consequence}
										</span>
									)}
								</span>
								<ActionKeycap slot={slot(index)} className="self-center" />
							</button>
						);
					})}
					{picked.has(OTHER) && (
						<Input
							value={other}
							onChange={(event) => setOther(event.target.value)}
							placeholder={t({ message: "Say what instead" })}
							aria-label={t({ message: "Say what instead" })}
							className="mt-1 text-sm"
						/>
					)}
				</div>
			)}
			<div className="flex items-center justify-end gap-2 pt-1">
				{question.optional && (
					<Button
						type="button"
						size="sm"
						variant="ghost"
						disabled={pending}
						data-action-key={focused ? "dismiss" : undefined}
						onClick={onSkip}
					>
						<Trans>Skip</Trans>
						<ActionKeycap slot={focused ? "dismiss" : undefined} />
					</Button>
				)}
				<Button
					type="button"
					size="sm"
					disabled={pending || blank}
					data-action-key={focused ? "primary" : undefined}
					onClick={() => onAnswer(value)}
					className="gap-1.5"
				>
					<LuCheck className="size-3.5" strokeWidth={2} />
					<Trans>Send answer</Trans>
					<ActionKeycap slot={focused ? "primary" : undefined} />
				</Button>
			</div>
		</fieldset>
	);
}
