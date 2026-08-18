import { SiLinear } from "react-icons/si";
import { ActorChip } from "../../TriggerSentence/components/ActorChip";
import { ScopeChip } from "../../TriggerSentence/components/ScopeChip";
import type { SentenceContext, TriggerProvider } from "../types";
import {
	LINEAR_MENU,
	LINEAR_SENTENCES,
	type LinearConfig,
	type SentencePart,
} from "./grammar";

/** Renders one slot of a Linear sentence; each slot edits the field it names. */
function renderPart(
	config: LinearConfig,
	part: SentencePart,
	index: number,
	{ set, mark, options, disabled }: SentenceContext,
) {
	if ("text" in part) {
		return (
			<span key={index} className="text-[13px] text-muted-foreground">
				{part.text}
			</span>
		);
	}
	switch (part.slot) {
		case "teams":
			return (
				<ScopeChip
					key={index}
					scope={config.teams}
					onChange={(v) => set({ teams: v })}
					className={mark("teams")}
					options={options.linear?.teams ?? []}
					emptyLabel="Select teams"
					anyLabel="Any team"
					disabled={disabled}
				/>
			);
		case "projects":
			return (
				<ScopeChip
					key={index}
					scope={config.projects}
					// Clearing an optional filter means "any", not "none": the chip
					// says "Any project" either way, and null would make that a lie.
					onChange={(v) => set({ projects: v ?? { mode: "any" } })}
					options={options.linear?.projects ?? []}
					emptyLabel="Any project"
					anyLabel="Any project"
					disabled={disabled}
				/>
			);
		case "labels":
			return (
				<ScopeChip
					key={index}
					scope={config.labels}
					onChange={(v) => set({ labels: v ?? { mode: "any" } })}
					options={options.linear?.labels ?? []}
					emptyLabel="Any label"
					anyLabel="Any label"
					disabled={disabled}
				/>
			);
		case "toStatus":
			return (
				<ScopeChip
					key={index}
					scope={config.toStatus}
					onChange={(v) => set({ toStatus: v ?? { mode: "any" } })}
					options={options.linear?.statuses ?? []}
					emptyLabel="Any status"
					anyLabel="Any status"
					disabled={disabled}
				/>
			);
		case "assignee":
			return (
				<ActorChip
					key={index}
					actor={config.assignee}
					onChange={(v) => set({ assignee: v })}
					className={mark("assignee")}
					people={options.linear?.people ?? []}
					disabled={disabled}
				/>
			);
	}
}

export const linearProvider: TriggerProvider<LinearConfig> = {
	kind: "linear",
	label: "Linear",
	icon: SiLinear,
	menu: LINEAR_MENU,
	renderSentence: (config, ctx) => {
		// A persisted config whose event has since been renamed must still
		// render, so an unknown event reads as its raw name rather than as
		// nothing.
		const parts = LINEAR_SENTENCES[config.event];
		if (!parts) {
			return (
				<span className="text-[13px] text-muted-foreground">
					{config.event}
				</span>
			);
		}
		return parts.map((part, index) => renderPart(config, part, index, ctx));
	},
};
