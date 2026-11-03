import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useRouterState } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useEffect, useMemo } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useIsChatSection } from "renderer/routes/_authenticated/_dashboard/hooks/useIsChatSection";
import {
	createChatTab,
	describeChatTab,
	useChatTabsStore,
} from "renderer/routes/_authenticated/_dashboard/stores/chatTabsStore";
import { ChatTabStrip } from "./components/ChatTabStrip";

/** Keeps a tab open for each channel and Dev you visit, and shows them while you are in the Chat section. */
export function ChatTabs() {
	const isEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.CHANNELS) === true;
	const isChatSection = useIsChatSection();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const href = useRouterState({ select: (state) => state.location.href });
	const organizationId = useActiveOrganizationId();
	const listInput = { organizationId: organizationId ?? "" };
	const canList = isEnabled && isChatSection && organizationId !== null;
	const channels = cloudTrpc.channel.list.useQuery(listInput, {
		enabled: canList,
	});
	const devs = cloudTrpc.agent.list.useQuery(listInput, { enabled: canList });

	const routeTab = useMemo(() => {
		const route = describeChatTab(pathname);
		return route && organizationId
			? createChatTab({ organizationId, route, href })
			: null;
	}, [organizationId, pathname, href]);

	useEffect(() => {
		if (isEnabled && routeTab) useChatTabsStore.getState().open(routeTab);
	}, [isEnabled, routeTab]);

	useEffect(() => {
		if (!channels.isSuccess || !organizationId) return;
		useChatTabsStore.getState().prune({
			organizationId,
			kind: "channel",
			liveIds: new Set(channels.data.map((channel) => channel.id)),
			keepId: routeTab?.id,
		});
	}, [channels.isSuccess, channels.data, organizationId, routeTab?.id]);

	useEffect(() => {
		if (!devs.isSuccess || !organizationId) return;
		useChatTabsStore.getState().prune({
			organizationId,
			kind: "dev",
			liveIds: new Set(devs.data.map((dev) => dev.id)),
			keepId: routeTab?.id,
		});
	}, [devs.isSuccess, devs.data, organizationId, routeTab?.id]);

	if (!isEnabled || !isChatSection) return null;
	return (
		<ChatTabStrip
			organizationId={organizationId}
			channels={channels.data ?? []}
			devs={devs.data ?? []}
		/>
	);
}
