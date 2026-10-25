import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import {
	type ChannelRealtimeEvent,
	parseChannelRealtimeEvent,
	USER_EVENTS_PATH,
} from "@superset/shared/channels";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { createRelaySocket } from "@superset/workspace-client";
import { useNavigate } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useEffect, useRef } from "react";
import { env } from "renderer/env.renderer";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { ensureFreshJwt } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { NOTIFICATION_EVENTS } from "shared/constants";
import { applyChannelMessage } from "../../hooks/useApplyChannelMessage";
import { useViewedChannelStore } from "../../stores/viewedChannelStore";
import { fromWire } from "../../utils/channelMessageCache";

const LIST_BACKSTOP_MS = 60_000;

/**
 * The signed-in user's channel events. Messages are written into the open
 * caches; the sidebar list is refetched for unread counts; mentions and
 * replies become native notifications unless that channel is on screen. A
 * reopen refetches every channel query, since events sent while the socket
 * was down are gone.
 */
export function ChannelsRealtime() {
	const enabled = useFeatureFlagEnabled(FEATURE_FLAGS.CHANNELS) === true;
	const organizationId = useActiveOrganizationId();
	const utils = cloudTrpc.useUtils();
	const navigate = useNavigate();
	const markRead = cloudTrpc.channel.markRead.useMutation();
	const markReadRef = useRef(markRead.mutate);
	markReadRef.current = markRead.mutate;

	electronTrpc.notifications.subscribe.useSubscription(undefined, {
		enabled,
		onData: (event) => {
			if (event.type === NOTIFICATION_EVENTS.OPEN_ROUTE && event.data) {
				void navigate({ to: event.data.path });
			}
		},
	});

	useEffect(() => {
		if (!enabled || !organizationId) return;

		const isViewing = (channelId: string) =>
			useViewedChannelStore.getState().channelId === channelId &&
			document.hasFocus();

		const refreshAll = () => {
			void utils.channel.invalidate();
			void utils.channelMessage.invalidate();
		};

		const handle = (event: ChannelRealtimeEvent) => {
			switch (event.type) {
				case "channel.message": {
					const message = fromWire(event.message);
					applyChannelMessage(utils, message);
					if (isViewing(message.channelId)) {
						markReadRef.current({ channelId: message.channelId });
					} else {
						void utils.channel.list.invalidate();
					}
					break;
				}
				case "channel.read":
					utils.channel.list.setData({ organizationId }, (rows) =>
						rows?.map((row) =>
							row.id === event.channelId
								? {
										...row,
										lastReadSeq: event.lastReadSeq,
										unreadCount: 0,
										mentionCount: 0,
									}
								: row,
						),
					);
					break;
				case "channels.changed":
					void utils.channel.invalidate();
					break;
				case "channel.notify": {
					if (event.organizationId !== organizationId) break;
					if (isViewing(event.channelId)) break;
					const { authorName, channelName } = event;
					const title = i18n._(
						event.reason === "reply"
							? msg({ message: `${authorName} replied in #${channelName}` })
							: event.reason === "mention"
								? msg({
										message: `${authorName} mentioned you in #${channelName}`,
									})
								: msg({ message: `${authorName} in #${channelName}` }),
					);
					const thread = event.threadRootId
						? `?thread=${encodeURIComponent(event.threadRootId)}`
						: "";
					void electronTrpcClient.notifications.showNative
						.mutate({
							title,
							body: event.preview,
							silent: false,
							clickPath: `/channels/${event.channelId}${thread}`,
						})
						.catch((error) => {
							console.warn("[channels] notification failed:", error);
						});
					break;
				}
			}
		};

		const socket = createRelaySocket({
			buildUrl: () => `${env.REALTIME_URL}${USER_EVENTS_PATH}`,
			getToken: () => ensureFreshJwt(),
			minReconnectionDelay: 1_000,
			maxReconnectionDelay: 30_000,
		});
		let opened = false;
		socket.addEventListener("open", () => {
			if (opened) refreshAll();
			opened = true;
		});
		socket.addEventListener("message", (event) => {
			const parsed = parseChannelRealtimeEvent(event.data);
			if (parsed) handle(parsed);
		});
		const backstop = setInterval(() => {
			if (!document.hidden) void utils.channel.list.invalidate();
		}, LIST_BACKSTOP_MS);
		return () => {
			clearInterval(backstop);
			socket.close(1000, "unsubscribed");
		};
	}, [enabled, organizationId, utils]);

	return null;
}
