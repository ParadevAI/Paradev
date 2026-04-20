import {
	isActiveSubscriptionStatus,
	type PlanTier,
} from "@superset/shared/billing";
import { useLiveQuery } from "@tanstack/react-db";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

interface ResolveCurrentPlanArgs {
	subscriptionPlan?: string | null;
	sessionPlan?: string | null;
	subscriptionsLoaded: boolean;
}

function isPaidPlanTier(
	plan: string | null | undefined,
): plan is "pro" | "enterprise" {
	return plan === "pro" || plan === "enterprise";
}

export function resolveCurrentPlan({
	subscriptionPlan,
	sessionPlan,
	subscriptionsLoaded,
}: ResolveCurrentPlanArgs): PlanTier {
	if (isPaidPlanTier(subscriptionPlan)) {
		return subscriptionPlan;
	}

	if (subscriptionsLoaded) {
		return "free";
	}

	if (isPaidPlanTier(sessionPlan)) {
		return sessionPlan;
	}

	return "free";
}

export function useCurrentPlan(): PlanTier {
	const { data: session } = authClient.useSession();
	const collections = useCollections();

	const { data: subscriptionsData } = useLiveQuery(
		(q) => q.from({ subscriptions: collections.subscriptions }),
		[collections],
	);

	const activeSubscription = subscriptionsData?.find((subscription) =>
		isActiveSubscriptionStatus(subscription.status),
	);

	return resolveCurrentPlan({
		subscriptionPlan: activeSubscription?.plan,
		sessionPlan: session?.session?.plan,
		subscriptionsLoaded: subscriptionsData !== undefined,
	});
}
