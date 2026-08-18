import { SiGmail } from "react-icons/si";
import { ScopeChip } from "../../TriggerSentence/components/ScopeChip";
import { SelectChip } from "../../TriggerSentence/components/SelectChip";
import { TextFilterChip } from "../../TriggerSentence/components/TextFilterChip";
import type { SentenceContext, TriggerProvider } from "../types";
import {
	ATTACHMENT_OPTIONS,
	GMAIL_MENU,
	GMAIL_SENTENCE,
	type GmailConfig,
	type GmailSlot,
	type SentencePart,
} from "./grammar";

function renderPart(
	config: GmailConfig,
	part: SentencePart<GmailSlot>,
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
		case "from":
			return (
				<ScopeChip
					key={index}
					scope={config.from}
					onChange={(v) => set({ from: v })}
					className={mark("from")}
					options={[]}
					emptyLabel="Select senders"
					anyLabel="Any sender"
					allowCustom={{ placeholder: "Add address or domain…" }}
					disabled={disabled}
				/>
			);
		case "to":
			return (
				<ScopeChip
					key={index}
					scope={config.to}
					// Clearing an optional filter means "any", not "none".
					onChange={(v) => set({ to: v ?? { mode: "any" } })}
					options={[]}
					emptyLabel="Any recipient"
					anyLabel="Any recipient"
					allowCustom={{ placeholder: "Add address or domain…" }}
					disabled={disabled}
				/>
			);
		case "subjectFilter":
			return (
				<TextFilterChip
					key={index}
					value={config.subjectFilter}
					onChange={(v) => set({ subjectFilter: v })}
					emptyLabel="anything"
					placeholder="Subject contains..."
					disabled={disabled}
				/>
			);
		case "labels":
			return (
				<ScopeChip
					key={index}
					scope={config.labels}
					onChange={(v) => set({ labels: v ?? { mode: "any" } })}
					options={options.google?.gmailLabels ?? []}
					emptyLabel="Any label"
					anyLabel="Any label"
					disabled={disabled}
				/>
			);
		case "hasAttachment":
			return (
				<SelectChip
					key={index}
					value={config.hasAttachment ? "attachment" : "any"}
					onChange={(v) => set({ hasAttachment: v === "attachment" })}
					options={ATTACHMENT_OPTIONS}
					disabled={disabled}
				/>
			);
	}
}

export const gmailProvider: TriggerProvider<GmailConfig> = {
	kind: "gmail",
	label: "Gmail",
	icon: SiGmail,
	menu: GMAIL_MENU,
	renderSentence: (config, ctx) =>
		GMAIL_SENTENCE.map((part, index) => renderPart(config, part, index, ctx)),
};
