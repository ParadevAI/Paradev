import type { PostHog } from "posthog-js";
import { HERO_HEADLINE_FLAG, type HeadlineVariant } from "@/lib/hero-headline";

export function recordHeadlineExposure(
	posthog: Pick<PostHog, "capture" | "has_opted_out_capturing">,
	variant: HeadlineVariant,
): void {
	if (posthog.has_opted_out_capturing()) return;
	posthog.capture("$feature_flag_called", {
		$feature_flag: HERO_HEADLINE_FLAG,
		$feature_flag_response: variant,
		[`$feature/${HERO_HEADLINE_FLAG}`]: variant,
		experiment_surface: "marketing_hero_headline",
	});
}
