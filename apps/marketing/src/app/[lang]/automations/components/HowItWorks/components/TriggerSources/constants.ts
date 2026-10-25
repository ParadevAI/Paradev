import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Clock } from "lucide-react";
import type { IconType } from "react-icons";
import { BsMicrosoftTeams } from "react-icons/bs";
import { FaGithub } from "react-icons/fa";
import { LuWebhook } from "react-icons/lu";
import { SiLinear, SiNotion, SiSentry } from "react-icons/si";

export interface TriggerSource {
	id: string;
	name: string | MessageDescriptor;
	icon: { image: string } | { glyph: IconType | typeof Clock; color?: string };
}

export const TRIGGER_SOURCES: TriggerSource[] = [
	{
		id: "github",
		name: "GitHub",
		icon: { glyph: FaGithub },
	},
	{
		id: "slack",
		name: "Slack",
		icon: { image: "/plugins/slack-icon.svg" },
	},
	{
		id: "linear",
		name: "Linear",
		icon: { glyph: SiLinear, color: "#5E6AD2" },
	},
	{
		id: "sentry",
		name: "Sentry",
		icon: { glyph: SiSentry, color: "#7553FF" },
	},
	{
		id: "notion",
		name: "Notion",
		icon: { glyph: SiNotion },
	},
	{
		id: "teams",
		name: "Microsoft Teams",
		icon: { glyph: BsMicrosoftTeams, color: "#5059C9" },
	},
	{
		id: "webhook",
		name: "Webhook",
		icon: { glyph: LuWebhook },
	},
	{
		id: "schedule",
		name: msg({ message: "Schedule" }),
		icon: { glyph: Clock },
	},
];
