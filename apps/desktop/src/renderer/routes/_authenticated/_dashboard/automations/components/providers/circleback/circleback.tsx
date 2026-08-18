import { LuMic } from "react-icons/lu";
import { env } from "renderer/env.renderer";
import { EndpointChip } from "../../TriggerSentence/components/EndpointChip";
import { ScopeChip } from "../../TriggerSentence/components/ScopeChip";
import { TextFilterChip } from "../../TriggerSentence/components/TextFilterChip";
import type { SentenceContext, TriggerProvider } from "../types";
import { SigningSecretChip } from "./components/SigningSecretChip";
import {
	CIRCLEBACK_MENU,
	CIRCLEBACK_SENTENCE,
	type CirclebackConfig,
	type SentencePart,
} from "./grammar";

export function circlebackWebhookUrl(triggerId: string): string {
	return `${env.NEXT_PUBLIC_API_URL}/api/integrations/circleback/webhook/${triggerId}`;
}

function renderPart(
	config: CirclebackConfig,
	part: SentencePart,
	index: number,
	{ set, disabled, triggerId }: SentenceContext,
) {
	if ("text" in part) {
		return (
			<span key={index} className="text-[13px] text-muted-foreground">
				{part.text}
			</span>
		);
	}
	switch (part.slot) {
		case "tags":
			return (
				<ScopeChip
					key={index}
					scope={config.tags}
					// Clearing an optional filter means "any", not "none": the chip
					// says "Any tag" either way, and null would make that a lie.
					onChange={(v) => set({ tags: v ?? { mode: "any" } })}
					options={[]}
					emptyLabel="Any tag"
					anyLabel="Any tag"
					allowCustom={{ placeholder: "Type a tag, press Enter" }}
					disabled={disabled}
				/>
			);
		case "attendees":
			return (
				<ScopeChip
					key={index}
					scope={config.attendees}
					onChange={(v) => set({ attendees: v ?? { mode: "any" } })}
					options={[]}
					emptyLabel="Any attendee"
					anyLabel="Any attendee"
					allowCustom={{ placeholder: "Type an email, press Enter" }}
					disabled={disabled}
				/>
			);
		case "nameFilter":
			return (
				<TextFilterChip
					key={index}
					value={config.nameFilter}
					onChange={(v) => set({ nameFilter: v })}
					emptyLabel="Any name"
					placeholder="Contains this text..."
					disabled={disabled}
				/>
			);
		case "endpoint":
			// The URL carries the saved row's id, so a row that has not been
			// saved yet has nothing to paste into Circleback.
			return (
				<EndpointChip
					key={index}
					url={triggerId ? circlebackWebhookUrl(triggerId) : null}
				/>
			);
		case "signingSecret":
			return (
				<SigningSecretChip
					key={index}
					triggerId={triggerId}
					disabled={disabled}
				/>
			);
	}
}

export const circlebackProvider: TriggerProvider<CirclebackConfig> = {
	kind: "circleback",
	label: "Circleback",
	icon: LuMic,
	menu: CIRCLEBACK_MENU,
	renderSentence: (config, ctx) =>
		CIRCLEBACK_SENTENCE.map((part, index) =>
			renderPart(config, part, index, ctx),
		),
};
