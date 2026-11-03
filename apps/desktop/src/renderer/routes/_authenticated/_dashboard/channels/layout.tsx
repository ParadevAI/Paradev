import { FEATURE_FLAGS } from "@superset/shared/constants";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { Redirect } from "renderer/components/Redirect";

export const Route = createFileRoute("/_authenticated/_dashboard/channels")({
	component: ChannelsLayout,
});

function ChannelsLayout() {
	const enabled = useFeatureFlagEnabled(FEATURE_FLAGS.CHANNELS);
	if (enabled === undefined) return null;
	if (!enabled) return <Redirect to="/v2-workspaces" />;
	return <Outlet />;
}
