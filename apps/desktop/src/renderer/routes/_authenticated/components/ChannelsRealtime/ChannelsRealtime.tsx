import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { errorMessage } from "@superset/i18n/errors";
import {
	type ChannelRealtimeEvent,
	parseChannelRealtimeEvent,
	USER_EVENTS_PATH,
} from "@superset/shared/channels";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { toast } from "@superset/ui/sonner";
import { createRelaySocket } from "@superset/workspace-client";
import { useNavigate } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useEffect, useRef } from "react";
import { env } from "renderer/env.renderer";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { authClient, ensureFreshJwt } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { playRingtone } from "renderer/lib/ringtones/play";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useOrgPresenceStore } from "renderer/stores/org-presence";
import { useRingtoneStore } from "renderer/stores/ringtone";
import { NOTIFICATION_EVENTS } from "shared/constants";
import { applyChannelMessage } from "../../hooks/useApplyChannelMessage";
import {
	applyChannelRead,
	applyThreadRead,
} from "../../hooks/useChannelReadState";
import { useViewedChannelStore } from "../../stores/viewedChannelStore";
import { fromWire } from "../../utils/channelMessageCache";
import {
	channelNotificationContent,
	channelNotificationGroup,
	channelNotificationPath,
	parseReplyTarget,
	replyTargetOf,
} from "./utils/channelNotification";

const LIST_BACKSTOP_MS = 60_000;
/** Slack plays at most one sound per conversation in this window. */
const SOUND_DEBOUNCE_MS = 5_000;

/**
 * The signed-in user's channel events. Messages are written into the open
 * caches; the sidebar lists are refetched for unread state, which the open
 * channel then clears once its new messages are seen; mentions and
 * replies become native notifications unless that conversation is on screen. A
 * reopen refetches every channel query, since events sent while the socket
 * was down are gone.
 */
export function ChannelsRealtime() {
	const enabled = useFeatureFlagEnabled(FEATURE_FLAGS.CHANNELS) === true;
	const organizationId = useActiveOrganizationId();
	const utils = cloudTrpc.useUtils();
	const navigate = useNavigate();
	const { data: session } = authClient.useSession();
	const currentUserId = useRef<string | null>(null);
	currentUserId.current = session?.user?.id ?? null;

	electronTrpc.notifications.subscribe.useSubscription(undefined, {
		enabled,
		onData: (event) => {
			if (event.type === NOTIFICATION_EVENTS.OPEN_ROUTE && event.data) {
				void navigate({ href: event.data.path });
			}
			if (event.type === NOTIFICATION_EVENTS.NOTIFICATION_REPLY && event.data) {
				const target = parseReplyTarget(event.data.target);
				if (!target) return;
				void utils.client.channelMessage.send
					.mutate({
						...target,
						body: event.data.text,
						clientId: crypto.randomUUID(),
						mentionedIds: [],
						fileIds: [],
					})
					.then(
						(message) => applyChannelMessage(utils, message),
						(error) => {
							console.warn("[channels] notification reply failed:", error);
							toast.error(
								errorMessage(
									error,
									i18n._(msg({ message: "Couldn't send the reply" })),
								),
							);
						},
					);
			}
		},
	});

	useEffect(() => {
		if (!enabled || !organizationId) return;

		const isViewing = (channelId: string, threadRootId: string | null) => {
			if (!document.hasFocus()) return false;
			const viewed = useViewedChannelStore.getState();
			if (!threadRootId) return viewed.channelId === channelId;
			return (
				viewed.threadsView ||
				(viewed.channelId === channelId && viewed.threadRootId === threadRootId)
			);
		};
		const lastSoundAt = new Map<string, number>();
		const playSound = async (group: string) => {
			const now = Date.now();
			if (now - (lastSoundAt.get(group) ?? 0) < SOUND_DEBOUNCE_MS) return;
			lastSoundAt.set(group, now);
			const [muted, volume] = await Promise.all([
				electronTrpcClient.settings.getNotificationSoundsMuted.query(),
				electronTrpcClient.settings.getNotificationVolume.query(),
			]);
			await playRingtone({
				ringtoneId: useRingtoneStore.getState().selectedRingtoneId,
				volume,
				muted,
			});
		};
		const bounceDock = async () => {
			const prefs = await utils.channelNotificationPrefs.get.fetch(undefined, {
				staleTime: LIST_BACKSTOP_MS,
			});
			if (prefs.dockBounce === "off") return;
			await electronTrpcClient.notifications.bounceDock.mutate({
				untilFocused: prefs.dockBounce === "until_focused",
			});
		};
		const isAway = () => {
			const userId = currentUserId.current;
			return (
				userId !== null &&
				useOrgPresenceStore.getState().users[userId] === "away"
			);
		};

		const refreshAll = () => {
			void utils.channel.invalidate();
			void utils.channelMessage.invalidate();
			void utils.channelThread.invalidate();
			void utils.agent.invalidate();
		};

		const handle = (event: ChannelRealtimeEvent) => {
			switch (event.type) {
				case "channel.message": {
					const message = fromWire(event.message);
					applyChannelMessage(utils, message);
					if (message.threadRootId) {
						void utils.channelThread.list.invalidate();
					} else {
						void utils.channel.list.invalidate();
					}
					break;
				}
				case "channel.read":
					applyChannelRead(utils, organizationId, event.channelId, event);
					if (!event.hasUnread && event.mentionCount === 0) {
						void electronTrpcClient.notifications.closeGroup.mutate({
							groupId: channelNotificationGroup({
								channelId: event.channelId,
								threadRootId: null,
							}),
						});
					}
					break;
				case "channel.thread.read":
					applyThreadRead(utils, event.rootId, event);
					void electronTrpcClient.notifications.closeGroup.mutate({
						groupId: channelNotificationGroup({
							channelId: event.channelId,
							threadRootId: event.rootId,
						}),
					});
					break;
				case "channel.tasks":
					void utils.channelTask.list.invalidate({
						channelId: event.channelId,
					});
					void utils.channelTask.forTask.invalidate();
					break;
				case "channels.changed":
					void utils.channel.invalidate();
					void utils.channelThread.invalidate();
					break;
				case "agents.changed":
					if (event.organizationId !== organizationId) break;
					void utils.agent.list.invalidate();
					void utils.agent.get.invalidate({ agentId: event.agentId });
					void utils.agent.activity.invalidate({ agentId: event.agentId });
					void utils.agentRoutine.list.invalidate({ agentId: event.agentId });
					break;
				case "channel.notify": {
					if (event.organizationId !== organizationId) break;
					if (isViewing(event.channelId, event.threadRootId)) break;
					if (event.reason === "here" && isAway()) break;
					const group = channelNotificationGroup(event);
					void electronTrpcClient.notifications.showNative
						.mutate({
							...channelNotificationContent(event),
							silent: true,
							clickPath: channelNotificationPath(event),
							id: event.messageId,
							groupId: group,
							replyTarget: replyTargetOf(event),
						})
						.catch((error) => {
							console.warn("[channels] notification failed:", error);
						});
					void playSound(group).catch((error) => {
						console.warn("[channels] notification sound failed:", error);
					});
					void bounceDock().catch((error) => {
						console.warn("[channels] dock bounce failed:", error);
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
