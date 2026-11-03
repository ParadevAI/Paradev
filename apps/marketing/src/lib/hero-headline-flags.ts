import { PostHog } from "posthog-node";
import {
	HERO_HEADLINE_FLAG,
	type HeadlineVariant,
	isHeadlineVariant,
} from "./hero-headline";

// Read from process.env, not @/env: the proxy's tests import this module with no environment.
const secretKey = process.env.POSTHOG_PROJECT_SECRET_KEY;
const projectKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

/** Polls flag definitions in the background and evaluates them in-process. */
const posthog =
	secretKey && projectKey
		? new PostHog(projectKey, {
				host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
				personalApiKey: secretKey,
				strictLocalEvaluation: true,
				flushAt: 1,
				flushInterval: 0,
			})
		: null;

/**
 * Undefined until the flag definitions have loaded, so a request never waits on
 * PostHog. Null when the visitor is not in the experiment.
 */
export async function evaluateHeadlineVariant(
	distinctId: string,
): Promise<HeadlineVariant | null | undefined> {
	if (!posthog?.isLocalEvaluationReady()) return undefined;
	const variant = await posthog.getFeatureFlag(HERO_HEADLINE_FLAG, distinctId, {
		onlyEvaluateLocally: true,
		sendFeatureFlagEvents: false,
	});
	return isHeadlineVariant(variant) ? variant : null;
}
