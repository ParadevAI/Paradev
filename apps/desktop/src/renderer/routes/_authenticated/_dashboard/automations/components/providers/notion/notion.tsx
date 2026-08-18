import { SiNotion } from "react-icons/si";
import { ActorChip } from "../../TriggerSentence/components/ActorChip";
import { ScopeChip } from "../../TriggerSentence/components/ScopeChip";
import type { SentenceContext, TriggerProvider } from "../types";
import {
	NOTION_MENU,
	NOTION_SENTENCES,
	type NotionConfig,
	type SentencePart,
} from "./grammar";

function renderPart(
	config: NotionConfig,
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
	// The slot list is derived from this event, so the fields it names are
	// present on this config member even where the union type cannot say so.
	const c = config as unknown as Record<string, never>;
	switch (part.slot) {
		case "dataSources":
			return (
				<ScopeChip
					key={index}
					scope={c.dataSources}
					onChange={(v) => set({ dataSources: v })}
					className={mark("dataSources")}
					options={options.notion?.dataSources ?? []}
					emptyLabel="Select data sources"
					anyLabel="Any data source"
					disabled={disabled}
				/>
			);
		case "pages":
			return (
				<ScopeChip
					key={index}
					scope={c.pages}
					// Clearing an optional filter means "any", not "none".
					onChange={(v) => set({ pages: v ?? { mode: "any" } })}
					options={[]}
					emptyLabel="Any page"
					anyLabel="Any page"
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
					people={options.notion?.people ?? []}
					disabled={disabled}
				/>
			);
		case "mentionedUser":
			return (
				<ActorChip
					key={index}
					actor={c.mentionedUser}
					onChange={(v) => set({ mentionedUser: v })}
					className={mark("mentionedUser")}
					people={options.notion?.people ?? []}
					disabled={disabled}
				/>
			);
	}
}

export const notionProvider: TriggerProvider<NotionConfig> = {
	kind: "notion",
	label: "Notion",
	icon: SiNotion,
	menu: NOTION_MENU,
	renderSentence: (config, ctx) => {
		const parts = NOTION_SENTENCES[config.event];
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
