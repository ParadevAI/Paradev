import { createHash } from "node:crypto";
import type { calendar_v3 } from "@googleapis/calendar";
import { z } from "zod";
import {
	type CalendarFindTimeView,
	type CalendarSpan,
	type CardField,
	CardUnavailable,
	defineCard,
	withInput,
} from "../types";
import {
	type AskRefs,
	askRefs,
	oneAsk,
	readAsk,
	replyToAsk,
} from "./calendarAsk";
import {
	type CalendarReader,
	calendarReader,
	DRAFT_MAX,
	describeSpanError,
	noteSchema,
	spanSchema,
	weekFrom,
} from "./calendarCard";
import { calendarWriteError, eventExists } from "./calendarClient";
import { describeSpan, openSlots, overlaps } from "./calendarEvents";

interface Refs extends AskRefs {
	title: string;
	minutes: number;
	guests: string[];
	from?: string;
	reply?: string;
}

interface Data {
	title: string;
	timeZone: string;
	guests: string[];
	canReply: boolean;
	window: CalendarSpan;
}

const TITLE_MAX = 200;
const REPLY_MAX = 5000;
const GUESTS_MAX = 20;
const SLOTS_MAX = 10;
const MINUTES_MIN = 15;
const MINUTES_MAX = 8 * 60;

const NO_REPLY_ACCESS = "Connect the account the ask came through to reply";

/** When each guest is busy. Google answers only for calendars it shares with the reader; a guest it won't answer for is left out, not counted as free. */
async function guestsBusy(
	reader: CalendarReader,
	guests: string[],
	window: CalendarSpan,
): Promise<CalendarFindTimeView["guestsBusy"]> {
	if (!reader.canSeeOthersBusy || guests.length === 0) return [];
	const calendars = await reader.client.freebusy
		.query({
			requestBody: {
				timeMin: window.start,
				timeMax: window.end,
				items: guests.map((id) => ({ id })),
			},
		})
		.then(
			(response) => response.data.calendars ?? {},
			(): Record<string, calendar_v3.Schema$FreeBusyCalendar> => ({}),
		);
	return guests.flatMap((email) => {
		const calendar = calendars[email];
		if (!calendar || calendar.errors?.length) return [];
		return [
			{
				email,
				busy: (calendar.busy ?? []).flatMap((span) =>
					span.start && span.end
						? [
								{
									start: new Date(span.start).toISOString(),
									end: new Date(span.end).toISOString(),
								},
							]
						: [],
				),
			},
		];
	});
}

/**
 * One event per card and time, so a second click after a timeout finds the
 * first event instead of inviting everyone twice. Google takes ids in
 * base32hex, which hex digits are part of.
 */
function eventIdFor(
	cardId: string | undefined,
	ask: string,
	span: CalendarSpan,
): string {
	return createHash("sha256")
		.update(`${cardId ?? crypto.randomUUID()}|${ask}|${span.start}|${span.end}`)
		.digest("hex")
		.slice(0, 40);
}

export const calendarFindTime = defineCard<Refs, Data>({
	type: "google_calendar.find_time",
	label: "Find a time",
	ask: "Offer times",
	brand: "google_calendar",
	refs: z
		.object({
			...askRefs,
			/** A draft: what the event would be called. The reader sees it before the event is made. */
			title: z.string().trim().min(1).max(TITLE_MAX),
			minutes: z.number().int().min(MINUTES_MIN).max(MINUTES_MAX).default(30),
			/** Addresses separated by commas, since refs hold no lists. */
			guests: z
				.string()
				.max(DRAFT_MAX)
				.default("")
				.transform((list) =>
					list
						.split(",")
						.map((email) => email.trim().toLowerCase())
						.filter(Boolean),
				)
				.pipe(z.array(z.string().email()).max(GUESTS_MAX)),
			/** The first day to look at; today when absent. */
			from: z.string().date().optional(),
			reply: z.string().max(DRAFT_MAX).optional(),
		})
		.refine(oneAsk, {
			message: "Name one ask: a Gmail thread, or a Slack channel and thread",
		}),
	async resolve({ refs, ctx }) {
		const now = new Date();
		const reader = await calendarReader(ctx);
		const ahead =
			refs.from && Date.parse(`${refs.from}T23:59:59Z`) > now.getTime();
		const [ask, week] = await Promise.all([
			readAsk(ctx, refs),
			weekFrom(reader, ahead ? { date: refs.from as string } : now, new Set()),
		]);
		const others = await guestsBusy(reader, refs.guests, week.window);
		const view: CalendarFindTimeView = {
			kind: "google_calendar.find_time",
			account: { email: reader.email, photo: reader.photo },
			ask: ask.view,
			title: refs.title,
			minutes: refs.minutes,
			guests: refs.guests.map((email) => ({
				email,
				name: null,
				inThread: ask.participants ? ask.participants.has(email) : null,
			})),
			timeZone: week.timeZone,
			window: week.window,
			busy: week.busy,
			guestsBusy: others,
			slots: openSlots({
				busy: [...week.busy, ...others.flatMap((guest) => guest.busy)],
				window: week.window,
				minutes: refs.minutes,
				timeZone: week.timeZone,
				now,
			}),
			reply: refs.reply ?? "",
			canReply: ask.canReply,
		};
		const fields: CardField[] = [
			{ label: "Asked by", value: ask.view.from },
			{ label: "Length", value: `${refs.minutes} min` },
			{ label: "Open times", value: String(view.slots.length) },
		];
		return {
			title: ask.view.subject ?? "Find a time",
			subtitle: ask.view.from,
			fields,
			body: ask.view.snippet || undefined,
			view,
			data: {
				title: refs.title,
				timeZone: week.timeZone,
				guests: refs.guests,
				canReply: ask.canReply,
				window: week.window,
			},
		};
	},
	actions: {
		offer: {
			label: () => "Send reply",
			style: "primary",
			role: "primary",
			available: (data) => data.canReply || NO_REPLY_ACCESS,
			run: withInput(
				z.object({
					slots: z.array(spanSchema).min(1).max(SLOTS_MAX),
					text: z.string().trim().min(1).max(REPLY_MAX),
					/** `ask.version` from the view the reader replied from. */
					version: z.string().min(1).max(64),
				}),
				async ({ refs, ctx, input }) => {
					await replyToAsk(ctx, refs, input.version, input.text);
					return {
						outcome: { offered: input.slots, text: input.text },
						notice: { tone: "good", text: "Reply sent" },
					};
				},
				describeSpanError,
			),
		},
		create_event: {
			label: () => "Create event",
			style: "secondary",
			role: "other",
			confirm: (data) =>
				data.guests.length
					? `Create this event and email invitations to ${data.guests.join(", ")}?`
					: "Create this event on your calendar?",
			run: withInput(
				spanSchema.and(
					z.object({
						title: z.string().trim().min(1).max(TITLE_MAX).optional(),
						note: noteSchema,
					}),
				),
				async ({ refs, data, ctx, input }) => {
					const span = { start: input.start, end: input.end };
					if (!overlaps(span, data.window)) {
						throw new CardUnavailable(
							"error",
							"Pick a time in the days the card shows",
						);
					}
					const reader = await calendarReader(ctx);
					const id = eventIdFor(
						ctx.card?.id,
						refs.gmail_thread ??
							`${refs.slack_channel}:${refs.slack_thread_ts}`,
						span,
					);
					const created = await reader.client.events
						.insert({
							calendarId: "primary",
							sendUpdates: "all",
							requestBody: {
								id,
								summary: input.title ?? data.title,
								description: input.note || undefined,
								start: { dateTime: span.start, timeZone: data.timeZone },
								end: { dateTime: span.end, timeZone: data.timeZone },
								attendees: data.guests.map((email) => ({ email })),
							},
						})
						.then((response) => response.data)
						.catch((error) =>
							eventExists(error)
								? reader.client.events
										.get({ calendarId: "primary", eventId: id })
										.then((response) => response.data)
										.catch(calendarWriteError)
								: calendarWriteError(error),
						);
					if (created.status === "cancelled") {
						throw new CardUnavailable(
							"error",
							"An event for that time was made and then cancelled. Pick another time",
						);
					}
					return {
						outcome: {
							created: true,
							eventId: created.id ?? id,
							url: created.htmlLink ?? null,
							...span,
						},
						notice: {
							tone: "good",
							text: `Event created for ${describeSpan(span, data.timeZone)}`,
						},
					};
				},
				describeSpanError,
			),
		},
	},
});
