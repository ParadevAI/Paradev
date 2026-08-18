import { SiSentry } from "react-icons/si";
import { ScopeChip } from "../../TriggerSentence/components/ScopeChip";
import type { SentenceContext, TriggerProvider } from "../types";
import {
	SENTRY_MENU,
	SENTRY_SENTENCES,
	type SentencePart,
	type SentryConfig,
} from "./grammar";

function renderPart(
	config: SentryConfig,
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
		case "projects":
			return (
				<ScopeChip
					key={index}
					scope={config.projects}
					onChange={(v) => set({ projects: v })}
					className={mark("projects")}
					options={options.sentry?.projects ?? []}
					emptyLabel="Select projects"
					anyLabel="Any project"
					disabled={disabled}
				/>
			);
		case "level":
			return (
				<ScopeChip
					key={index}
					scope={config.level}
					// Clearing an optional filter means "any", not "none": the chip
					// says "Any level" either way, and null would make that a lie.
					onChange={(v) => set({ level: v ?? { mode: "any" } })}
					options={options.sentry?.levels ?? []}
					emptyLabel="Any level"
					anyLabel="Any level"
					disabled={disabled}
				/>
			);
	}
}

export const sentryProvider: TriggerProvider<SentryConfig> = {
	kind: "sentry",
	label: "Sentry",
	icon: SiSentry,
	menu: SENTRY_MENU,
	renderSentence: (config, ctx) => {
		// A persisted config whose event has since been renamed must still
		// render, so an unknown event reads as its raw name rather than as nothing.
		const parts = SENTRY_SENTENCES[config.event];
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
