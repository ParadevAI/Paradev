import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useMatchRoute } from "renderer/hooks/useMatchRoute";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { playRingtone } from "renderer/lib/ringtones/play";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useRingtoneStore } from "renderer/stores/ringtone";
import { NOTIFICATION_EVENTS } from "shared/constants";
import {
	chatNotification,
	chatNotificationGroup,
	chatOfReplyTarget,
} from "../../utils/chatNotification";
import type { ChatsStore } from "../useChatsStore";

/** A busy chat plays at most one sound in this window. */
const SOUND_DEBOUNCE_MS = 5_000;

const warn = (what: string) => (error: unknown) =>
	console.warn(`[chats] ${what} failed:`, error);

async function playSound() {
	const [muted, volume] = await Promise.all([
		electronTrpcClient.settings.getNotificationSoundsMuted.query(),
		electronTrpcClient.settings.getNotificationVolume.query(),
	]);
	await playRingtone({
		ringtoneId: useRingtoneStore.getState().selectedRingtoneId,
		volume,
		muted,
	});
}

/**
 * Desktop notifications for new messages and questions: a click opens the
 * chat, a reply typed in the notification is sent to it, and reading the chat
 * anywhere takes its notifications away.
 */
export function useChatNotifications(store: ChatsStore) {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const viewed = matchRoute({ to: "/chats/$chatId", fuzzy: true });
	const latest = useRef({
		state: store.state,
		openChatId: null as string | null,
	});
	latest.current = {
		state: store.state,
		openChatId: viewed ? viewed.chatId : null,
	};
	const dispatch = useRef(store.dispatch);
	dispatch.current = store.dispatch;

	electronTrpc.notifications.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (event.type === NOTIFICATION_EVENTS.OPEN_ROUTE && event.data) {
				void navigate({ href: event.data.path });
			}
			if (event.type === NOTIFICATION_EVENTS.NOTIFICATION_REPLY && event.data) {
				const chatId = chatOfReplyTarget(event.data.target);
				if (chatId)
					dispatch.current({ type: "send", chatId, text: event.data.text });
			}
		},
	});

	const subscribe = store.live.subscribe;
	useEffect(() => {
		const lastSoundAt = new Map<string, number>();
		return subscribe((signal) => {
			if (signal.type !== "event") return;
			const { state, openChatId } = latest.current;
			if (!state) return;
			const { event } = signal;
			if (event.type === "chat.read") {
				if (event.userId !== state.meId) return;
				void electronTrpcClient.notifications.closeGroup
					.mutate({ groupId: chatNotificationGroup(event.groupId) })
					.catch(warn("clearing notifications"));
				return;
			}
			const content = chatNotification(state, event, {
				openChatId,
				focused: document.hasFocus(),
			});
			if (!content) return;
			void electronTrpcClient.notifications.showNative
				.mutate(content)
				.catch(warn("notification"));
			const now = Date.now();
			if (now - (lastSoundAt.get(content.groupId) ?? 0) < SOUND_DEBOUNCE_MS)
				return;
			lastSoundAt.set(content.groupId, now);
			void playSound().catch(warn("notification sound"));
		});
	}, [subscribe]);
}
