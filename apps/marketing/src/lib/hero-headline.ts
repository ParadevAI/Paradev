import { POSTHOG_COOKIE_NAME } from "@superset/shared/constants";
import { ANALYTICS_CONSENT_KEY } from "@/lib/constants";

export const HERO_HEADLINE_FLAG = "marketing-hero-headline";
export const HEADLINE_VARIANTS = ["control", "ide", "army"] as const;
export type HeadlineVariant = (typeof HEADLINE_VARIANTS)[number];

export const HEADLINE_VARIANT_COOKIE = "superset_hero_headline";
/** Distinct id the proxy picked for a visitor PostHog has not seen yet. */
export const BOOTSTRAP_DISTINCT_ID_COOKIE = "superset_bootstrap_id";
/** posthog-js prefixes `persistence_name` with `ph_`. */
export const POSTHOG_PERSISTENCE_COOKIE = `ph_${POSTHOG_COOKIE_NAME}`;
export const HEADLINE_VARIANT_PREVIEW_PARAM = "hero-headline-preview";

export function isHeadlineVariant(value: unknown): value is HeadlineVariant {
	return HEADLINE_VARIANTS.includes(value as HeadlineVariant);
}

/**
 * Shows only the assigned arm. Inlined in <head>, not globals.css: `next build`
 * dropped these rules from the production CSS while dev kept them.
 */
export const HEADLINE_VARIANT_STYLE = HEADLINE_VARIANTS.map((variant) =>
	variant === "control"
		? `html[data-hero-headline]:not([data-hero-headline="control"]) [data-headline-variant="control"]{display:none}`
		: `html:not([data-hero-headline="${variant}"]) [data-headline-variant="${variant}"]{display:none}`,
).join("");

/** Runs in <head> before first paint, so the assigned headline paints first. */
export const APPLY_HEADLINE_VARIANT_SCRIPT = `try{var m=document.cookie.match(/(?:^|; )${HEADLINE_VARIANT_COOKIE}=(${HEADLINE_VARIANTS.join("|")})(?:;|$)/);if(m&&localStorage.getItem(${JSON.stringify(ANALYTICS_CONSENT_KEY)})!=="declined")document.documentElement.dataset.heroHeadline=m[1]}catch(e){}`;

export function readAssignedHeadlineVariant(): HeadlineVariant | null {
	const variant = document.documentElement.dataset.heroHeadline;
	return isHeadlineVariant(variant) ? variant : null;
}
