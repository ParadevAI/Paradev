import type {
	DraftTrigger,
	TriggerProblem,
} from "@superset/shared/automation-triggers";
import { Button } from "@superset/ui/button";
import type { ReactNode } from "react";
import { FaGithub } from "react-icons/fa";
import { LuTrash2, LuWebhook } from "react-icons/lu";
import { ScheduleSentence } from "../ScheduleSentence";
import { CHIP_INVALID } from "./chipStyles";
import { ActorChip } from "./components/ActorChip";
import { ScopeChip } from "./components/ScopeChip";
import { TextFilterChip } from "./components/TextFilterChip";
import type { ScopeOption } from "./scopeOption";
import { GITHUB_SENTENCES, type SentencePart } from "./sentence";

interface TriggerSentenceProps {
	trigger: DraftTrigger;
	onChange: (next: DraftTrigger) => void;
	onRemove: () => void;
	repositories: ScopeOption[];
	people: ScopeOption[];
	/** This row's problems, already filtered to it by the editor. */
	problems?: TriggerProblem[];
	/** Trailing "Next run ..." text for a schedule row. */
	nextRun?: ReactNode;
	disabled?: boolean;
}

/**
 * One trigger, rendered as a sentence.
 *
 * The grammar lives in `sentence.ts` so each event describes its own slots;
 * this only walks the parts and renders the matching control.
 */
export function TriggerSentence({
	trigger,
	onChange,
	onRemove,
	repositories,
	people,
	problems,
	nextRun,
	disabled,
}: TriggerSentenceProps) {
	const config = trigger.config;
	// A banner naming the row is not enough when a sentence has three chips that
	// could each be the empty one.
	const invalid = new Set((problems ?? []).map((p) => p.field));
	const mark = (field: string) =>
		invalid.has(field) ? CHIP_INVALID : undefined;
	const set = (patch: Record<string, unknown>) =>
		onChange({ ...trigger, config: { ...config, ...patch } as never });

	const renderPart = (part: SentencePart, index: number) => {
		if ("text" in part) {
			return (
				<span key={index} className="text-[13px] text-muted-foreground">
					{part.text}
				</span>
			);
		}
		// The slot list is derived from this event, so the fields it names are
		const c = config as unknown as Record<string, never>;
		switch (part.slot) {
			case "repositories":
				return (
					<ScopeChip
						key={index}
						scope={c.repositories}
						onChange={(v) => set({ repositories: v })}
						className={mark("repositories")}
						options={repositories}
						emptyLabel="Select repos"
						anyLabel="Any repo"
						disabled={disabled}
					/>
				);
			case "branches":
				return (
					<ScopeChip
						key={index}
						scope={c.branches}
						// Clearing an optional filter means "any", not "none": the chip
						// says "Any branch" either way, and null would make that a lie.
						onChange={(v) => set({ branches: v ?? { mode: "any" } })}
						options={[]}
						emptyLabel="Any branch"
						anyLabel="Any branch"
						disabled={disabled}
					/>
				);
			case "labels":
				return (
					<ScopeChip
						key={index}
						scope={c.labels}
						// Clearing an optional filter means "any", not "none": the chip
						// says "Any label" either way, and null would make that a lie.
						onChange={(v) => set({ labels: v ?? { mode: "any" } })}
						options={[]}
						emptyLabel="Any label"
						anyLabel="Any label"
						disabled={disabled}
					/>
				);
			case "actor":
				return (
					<ActorChip
						key={index}
						actor={c.actor}
						onChange={(v) => set({ actor: v })}
						className={mark("actor")}
						people={people}
						disabled={disabled}
					/>
				);
			case "subjectAuthor":
				return (
					<ActorChip
						key={index}
						actor={c.subjectAuthor}
						onChange={(v) => set({ subjectAuthor: v })}
						className={mark("subjectAuthor")}
						people={people}
						disabled={disabled}
					/>
				);
			case "commentFilter":
				return (
					<TextFilterChip
						key={index}
						value={c.commentFilter}
						onChange={(v) => set({ commentFilter: v })}
						emptyLabel="Any comment"
						placeholder="Contains this text..."
						disabled={disabled}
					/>
				);
		}
	};

	return (
		<div className="group flex min-h-10 flex-wrap items-center gap-1.5 rounded-[8px] px-2 py-1.5 hover:bg-foreground/[0.03]">
			{config.kind === "github" && (
				<FaGithub className="size-4 shrink-0 text-muted-foreground" />
			)}
			{config.kind === "webhook" && (
				<LuWebhook className="size-4 shrink-0 text-muted-foreground" />
			)}

			{config.kind === "github" &&
				GITHUB_SENTENCES[config.event].map(renderPart)}

			{config.kind === "schedule" && (
				<ScheduleSentence
					rrule={config.rrule}
					onRruleChange={(rrule) => set({ rrule })}
					timezone={config.timezone}
					nextRun={nextRun}
					disabled={disabled}
				/>
			)}

			{config.kind === "webhook" && (
				<span className="text-muted-foreground text-sm">
					Triggered by an incoming webhook
				</span>
			)}

			<Button
				type="button"
				variant="ghost"
				size="icon"
				aria-label="Remove trigger"
				disabled={disabled}
				onClick={onRemove}
				className="ml-auto size-6 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-foreground"
			>
				<LuTrash2 className="size-3.5" />
			</Button>
		</div>
	);
}
