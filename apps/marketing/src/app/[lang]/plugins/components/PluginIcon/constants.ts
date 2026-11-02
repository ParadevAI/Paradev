import type { IconType } from "react-icons";
import { FaGithub } from "react-icons/fa";
import {
	SiLinear,
	SiNotion,
	SiPosthog,
	SiSentry,
	SiSupabase,
	SiVercel,
} from "react-icons/si";
import { AutumnIcon } from "./components/AutumnIcon";
import { FirecrawlIcon } from "./components/FirecrawlIcon";
import { InngestIcon } from "./components/InngestIcon";
import { PeecIcon } from "./components/PeecIcon";
import { ResendIcon } from "./components/ResendIcon";
import { SazabiIcon } from "./components/SazabiIcon";
import { SuperhumanIcon } from "./components/SuperhumanIcon";
import { WisprIcon } from "./components/WisprIcon";

export const IMAGE_ICONS: Record<string, string> = {
	circleback: "/plugins/circleback-icon.png",
	exa: "/plugins/exa-icon.svg",
	gmail: "/plugins/gmail-icon.svg",
	"google-calendar": "/plugins/google-calendar-icon.svg",
	granola: "/plugins/granola-icon.svg",
	neon: "/plugins/neon-icon.png",
	slack: "/plugins/slack-icon.svg",
	stripe: "/plugins/stripe-icon.svg",
	ynab: "/plugins/ynab-icon.png",
};

export const GLYPH_ICONS: Record<string, { icon: IconType; color?: string }> = {
	autumn: { icon: AutumnIcon },
	firecrawl: { icon: FirecrawlIcon, color: "#FA5D19" },
	github: { icon: FaGithub },
	inngest: { icon: InngestIcon },
	linear: { icon: SiLinear },
	notion: { icon: SiNotion },
	peec: { icon: PeecIcon },
	posthog: { icon: SiPosthog },
	resend: { icon: ResendIcon },
	sazabi: { icon: SazabiIcon, color: "#FF0027" },
	sentry: { icon: SiSentry },
	superhuman: { icon: SuperhumanIcon },
	supabase: { icon: SiSupabase, color: "#3ECF8E" },
	vercel: { icon: SiVercel },
	wispr: { icon: WisprIcon },
};
