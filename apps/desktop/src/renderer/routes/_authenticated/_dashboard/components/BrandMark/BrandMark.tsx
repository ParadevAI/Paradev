import { cn } from "@superset/ui/utils";
import { PluginIcon } from "renderer/components/PluginIcon";

export type Brand =
	| "github"
	| "gmail"
	| "google_calendar"
	| "slack"
	| "linear"
	| "posthog"
	| "stripe"
	| "sentry"
	| "superset";

/** Product names are never translated. */
export const BRAND_NAMES: Record<Brand, string> = {
	github: "GitHub",
	gmail: "Gmail",
	google_calendar: "Google Calendar",
	slack: "Slack",
	linear: "Linear",
	posthog: "PostHog",
	stripe: "Stripe",
	sentry: "Sentry",
	superset: "Superset",
};

interface BrandMarkProps {
	brand: Brand | null;
	className?: string;
	/** Draw it muted, for a card that could not resolve. */
	muted?: boolean;
}

/**
 * The integration's own mark, drawn from the same sources as the plugin
 * catalog so a brand looks the same everywhere. It appears only beside facts
 * that integration rendered, so it is the visible claim that the words next
 * to it are not an agent's summary; nothing else in the inbox may show one.
 */
export function BrandMark({ brand, className, muted }: BrandMarkProps) {
	if (brand === null) {
		return (
			<span
				className={cn(
					"size-4 shrink-0 rounded-[4px] border border-dashed border-border",
					className,
				)}
				aria-hidden
			/>
		);
	}
	return (
		<span
			aria-hidden
			className={cn("flex shrink-0", muted && "opacity-50 grayscale")}
		>
			<PluginIcon
				pluginName={brand}
				className={cn("size-4 rounded-[4px]", className)}
			/>
		</span>
	);
}
