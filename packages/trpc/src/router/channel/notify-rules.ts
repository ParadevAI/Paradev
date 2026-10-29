import type {
	ChannelNotify,
	SelectChannelNotificationPrefs,
} from "@superset/db/schema";
import type {
	ChannelBroadcast,
	ChannelNotifyReason,
} from "@superset/shared/channels";

export type NotifyPrefs = Omit<
	SelectChannelNotificationPrefs,
	"userId" | "updatedAt"
>;

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
	notify: "all",
	showPreview: true,
	keywords: [],
	pausedUntil: null,
	scheduleEnabled: false,
	scheduleDays: [0, 1, 2, 3, 4, 5, 6],
	scheduleStartMinute: 480,
	scheduleEndMinute: 1320,
	timeZone: null,
	dockBounce: "off",
};

export interface NotifyRecipient {
	userId: string;
	/** The channel's override; null follows `prefs.notify`. */
	notify: ChannelNotify | null;
	muted: boolean;
	suppressBroadcasts: boolean;
	followsThread: boolean;
}

export interface NotifyMessage {
	authorId: string | null;
	body: string;
	mentionedIds: readonly string[];
	broadcast: ChannelBroadcast | null;
	isReply: boolean;
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;

/** Whole-word, case-insensitive, as Slack matches highlight words. */
export function matchesKeyword(
	body: string,
	keywords: readonly string[],
): boolean {
	const text = body.toLowerCase();
	return keywords.some((raw) => {
		const keyword = raw.trim().toLowerCase();
		if (!keyword) return false;
		for (
			let at = text.indexOf(keyword);
			at !== -1;
			at = text.indexOf(keyword, at + 1)
		) {
			const before = text[at - 1];
			const after = text[at + keyword.length];
			if (
				(before === undefined || !WORD_CHAR.test(before)) &&
				(after === undefined || !WORD_CHAR.test(after))
			) {
				return true;
			}
		}
		return false;
	});
}

function localWeekdayAndMinute(
	now: Date,
	timeZone: string,
): { weekday: number; minute: number } {
	let parts: Record<string, string>;
	try {
		parts = Object.fromEntries(
			new Intl.DateTimeFormat("en-CA", {
				timeZone,
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
				hourCycle: "h23",
			})
				.formatToParts(now)
				.map((part) => [part.type, part.value]),
		);
	} catch {
		return localWeekdayAndMinute(now, "UTC");
	}
	const weekday = new Date(
		Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)),
	).getUTCDay();
	return { weekday, minute: Number(parts.hour) * 60 + Number(parts.minute) };
}

/**
 * Slack's notification schedule: notifications are allowed on the chosen
 * days between start and end. A window that ends before it starts runs past
 * midnight and belongs to the day it started.
 */
export function isOutsideSchedule(prefs: NotifyPrefs, now: Date): boolean {
	if (!prefs.scheduleEnabled) return false;
	const { weekday, minute } = localWeekdayAndMinute(
		now,
		prefs.timeZone ?? "UTC",
	);
	const start = prefs.scheduleStartMinute;
	const end = prefs.scheduleEndMinute;
	if (start === end) return !prefs.scheduleDays.includes(weekday);
	if (start < end) {
		return !(
			prefs.scheduleDays.includes(weekday) &&
			minute >= start &&
			minute < end
		);
	}
	if (minute >= start) return !prefs.scheduleDays.includes(weekday);
	if (minute < end) return !prefs.scheduleDays.includes((weekday + 6) % 7);
	return true;
}

export function isDoNotDisturb(prefs: NotifyPrefs, now: Date): boolean {
	if (prefs.pausedUntil && prefs.pausedUntil > now) return true;
	return isOutsideSchedule(prefs, now);
}

/**
 * Why a channel member should get a desktop notification for a message, or
 * null for none. Follows Slack's `shouldShowNotificationForChannelMessage`:
 * a direct mention (@you or a keyword) gets through a mute; @channel and
 * @everyone do not count in thread replies; Do Not Disturb blocks everything.
 */
export function notifyReason(
	recipient: NotifyRecipient,
	prefs: NotifyPrefs,
	message: NotifyMessage,
	now: Date,
): ChannelNotifyReason | null {
	if (message.authorId === recipient.userId) return null;
	const level = recipient.notify ?? prefs.notify;
	if (level === "none") return null;

	const direct =
		message.mentionedIds.includes(recipient.userId) ||
		matchesKeyword(message.body, prefs.keywords);
	const broadcast =
		message.broadcast !== null &&
		!(message.isReply && message.broadcast !== "here") &&
		(!recipient.suppressBroadcasts || (level === "all" && !recipient.muted))
			? message.broadcast
			: null;

	let reason: ChannelNotifyReason | null;
	if (direct) reason = "mention";
	else if (recipient.muted) reason = null;
	else if (broadcast) reason = broadcast === "here" ? "here" : "mention";
	else if (message.isReply) reason = recipient.followsThread ? "reply" : null;
	else reason = level === "all" ? "message" : null;

	if (reason && isDoNotDisturb(prefs, now)) return null;
	return reason;
}
