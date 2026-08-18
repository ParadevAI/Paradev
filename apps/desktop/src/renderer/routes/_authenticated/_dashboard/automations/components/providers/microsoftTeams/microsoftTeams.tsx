import { BsMicrosoftTeams } from "react-icons/bs";
import { ActorChip } from "../../TriggerSentence/components/ActorChip";
import { ScopeChip } from "../../TriggerSentence/components/ScopeChip";
import { TextFilterChip } from "../../TriggerSentence/components/TextFilterChip";
import type { SentenceContext, TriggerProvider } from "../types";
import {
	type MicrosoftTeamsConfig,
	type SentencePart,
	TEAMS_MENU,
	TEAMS_SENTENCES,
} from "./grammar";

function renderPart(
	config: MicrosoftTeamsConfig,
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
					options={options.microsoftTeams?.teams ?? []}
					emptyLabel="Select teams"
					anyLabel="Any team"
					disabled={disabled}
				/>
			);
		case "channels":
			return (
				<ScopeChip
					key={index}
					scope={config.channels}
					onChange={(v) => set({ channels: v })}
					className={mark("channels")}
					options={options.microsoftTeams?.channels ?? []}
					emptyLabel="Select channels"
					anyLabel="Any channel"
					disabled={disabled}
				/>
			);
		case "actor":
			return (
				<ActorChip
					key={index}
					actor={config.actor}
					onChange={(v) => set({ actor: v })}
					className={mark("actor")}
					people={options.microsoftTeams?.people ?? []}
					disabled={disabled}
				/>
			);
		case "messageFilter":
			return (
				<TextFilterChip
					key={index}
					value={config.messageFilter}
					onChange={(v) => set({ messageFilter: v })}
					emptyLabel="Any message"
					placeholder="Contains this text..."
					disabled={disabled}
				/>
			);
		case "nameFilter":
			return (
				<TextFilterChip
					key={index}
					value={config.messageFilter}
					onChange={(v) => set({ messageFilter: v })}
					emptyLabel="Any name"
					placeholder="Name contains..."
					disabled={disabled}
				/>
			);
	}
}

export const microsoftTeamsProvider: TriggerProvider<MicrosoftTeamsConfig> = {
	kind: "microsoft_teams",
	label: "Microsoft Teams",
	icon: BsMicrosoftTeams,
	menu: TEAMS_MENU,
	renderSentence: (config, ctx) => {
		const parts = TEAMS_SENTENCES[config.event];
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
