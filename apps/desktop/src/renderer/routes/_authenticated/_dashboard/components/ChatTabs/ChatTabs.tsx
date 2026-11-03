import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useMatchRoute, useRouterState } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useEffect } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	describeChatTab,
	useChatTabsStore,
} from "renderer/routes/_authenticated/_dashboard/stores/chatTabsStore";
import { ChatTabStrip } from "./components/ChatTabStrip";

/** Keeps a tab open for each channel and Dev you visit, and shows them while you are in the Chat section. */
export function ChatTabs() {
	const isEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.CHANNELS) === true;
	const matchRoute = useMatchRoute();
	const isChatSection =
		!!matchRoute({ to: "/channels", fuzzy: true }) ||
		!!matchRoute({ to: "/devs", fuzzy: true });
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const href = useRouterState({ select: (state) => state.location.href });
	const organizationId = useActiveOrganizationId();
	const listInput = { organizationId: organizationId ?? "" };
	const canList = isEnabled && organizationId !== null;
	const channels = cloudTrpc.channel.list.useQuery(listInput, {
		enabled: canList,
	});
	const devs = cloudTrpc.agent.list.useQuery(listInput, { enabled: canList });

	useEffect(() => {
		if (!isEnabled) return;
		const tab = describeChatTab(pathname);
		if (tab) useChatTabsStore.getState().open({ ...tab, href });
	}, [isEnabled, pathname, href]);

	useEffect(() => {
		if (!channels.isSuccess) return;
		useChatTabsStore
			.getState()
			.prune("channel", new Set(channels.data.map((channel) => channel.id)));
	}, [channels.isSuccess, channels.data]);

	useEffect(() => {
		if (!devs.isSuccess) return;
		useChatTabsStore
			.getState()
			.prune("dev", new Set(devs.data.map((dev) => dev.id)));
	}, [devs.isSuccess, devs.data]);

	if (!isEnabled || !isChatSection) return null;
	return <ChatTabStrip channels={channels.data ?? []} devs={devs.data ?? []} />;
}
