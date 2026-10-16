import type { calendar_v3 } from "@googleapis/calendar";
import { z } from "zod";
import {
	type CalendarChangeView,
	type CalendarSpan,
	type CardField,
	CardUnavailable,
	defineCard,
	withInput,
} from "../types";
import {
	anchorOf,
	calendarReader,
	DRAFT_MAX,
	describeSpanError,
	EVENT_ID,
	eventView,
	fetchEvent,
	noteRecipients,
	noteSchema,
	spanSchema,
	weekFrom,
} from "./calendarCard";
import { calendarWriteError, eventGone } from "./calendarClient";
import { conflictsWith, describeSpan } from "./calendarEvents";
import { canMailNote, mailNote, NOTE_RECIPIENTS_MAX } from "./calendarMail";

interface Refs {
	event: string;
	change: "reschedule" | "cancel";
	start?: string;
	end?: string;
	note?: string;
}

interface Data {
	event: calendar_v3.Schema$Event;
	title: string;
	timeZone: string;
	guests: number;
	change: Refs["change"];
	organizer: boolean;
	cancelled: boolean;
	current: CalendarSpan;
}

const NOT_YOURS = "Only the organizer can change this event";
const CANCELLED = "This event was already cancelled";
const NOTE_NOT_SENT = "Your note could not be emailed to the guests";
const NOTE_TOO_WIDE = `Your note was not emailed: the event has more than ${NOTE_RECIPIENTS_MAX} guests`;

async function noteGuests(
	ctx: Parameters<typeof mailNote>[0],
	event: calendar_v3.Schema$Event,
	note: { subject: string; text: string } | null,
): Promise<{ emailed: boolean; trouble: string | null }> {
	if (!note) return { emailed: false, trouble: null };
	const { to, hidden } = noteRecipients(event);
	if (to.length === 0) return { emailed: false, trouble: null };
	if (to.length > NOTE_RECIPIENTS_MAX)
		return { emailed: false, trouble: NOTE_TOO_WIDE };
	const emailed = await mailNote(ctx, { to, hidden, ...note }).catch(
		() => false,
	);
	return { emailed, trouble: emailed ? null : NOTE_NOT_SENT };
}

export const calendarChange = defineCard<Refs, Data>({
	type: "google_calendar.change",
	label: "Calendar event change",
	ask: "Change event",
	brand: "google_calendar",
	refs: z
		.object({
			/** An event on the reader's primary calendar that they organize. */
			event: z.string().regex(EVENT_ID),
			change: z.enum(["reschedule", "cancel"]),
			start: z.string().datetime({ offset: true }).optional(),
			end: z.string().datetime({ offset: true }).optional(),
			note: z.string().max(DRAFT_MAX).optional(),
		})
		.refine((refs) => Boolean(refs.start) === Boolean(refs.end), {
			message: "Give both a start and an end, or neither",
		}),
	async resolve({ refs, ctx }) {
		const reader = await calendarReader(ctx);
		const event = await fetchEvent(reader.client, refs.event);
		const proposal =
			refs.start && refs.end
				? {
						start: new Date(refs.start).toISOString(),
						end: new Date(refs.end).toISOString(),
					}
				: null;
		const [{ timeZone, window, busy }, canEmailNote] = await Promise.all([
			weekFrom(
				reader,
				proposal ? new Date(proposal.start) : anchorOf(event),
				new Set([refs.event]),
			),
			canMailNote(ctx),
		]);
		const facts = eventView(event, reader, timeZone);
		const view: CalendarChangeView = {
			kind: "google_calendar.change",
			account: { email: reader.email, photo: reader.photo },
			event: facts,
			change: refs.change,
			proposal,
			conflicts: proposal ? conflictsWith(proposal, busy) : [],
			busy,
			window,
			note: refs.note ?? "",
			canChange: facts.organizer.self && !facts.cancelled,
			canEmailNote:
				canEmailNote && noteRecipients(event).to.length <= NOTE_RECIPIENTS_MAX,
		};
		const fields: CardField[] = [
			{ label: "When", value: describeSpan(facts, timeZone) },
			...(proposal
				? [{ label: "Move to", value: describeSpan(proposal, timeZone) }]
				: []),
			{ label: "Guests", value: String(facts.guests.length) },
		];
		return {
			title: facts.title,
			subtitle: refs.change === "cancel" ? "Cancel" : "Reschedule",
			fields,
			view,
			data: {
				event,
				title: facts.title,
				timeZone,
				guests: facts.guests.filter((guest) => !guest.self).length,
				change: refs.change,
				organizer: facts.organizer.self,
				cancelled: facts.cancelled,
				current: { start: facts.start, end: facts.end },
			},
		};
	},
	actions: {
		reschedule: {
			label: () => "Reschedule",
			style: "primary",
			role: "primary",
			applies: (data) => data.change === "reschedule",
			available: (data) =>
				data.cancelled ? CANCELLED : data.organizer || NOT_YOURS,
			run: withInput(
				spanSchema.and(z.object({ note: noteSchema })),
				async ({ refs, data, ctx, input }) => {
					const span = { start: input.start, end: input.end };
					if (
						Date.parse(span.start) === Date.parse(data.current.start) &&
						Date.parse(span.end) === Date.parse(data.current.end)
					) {
						throw new CardUnavailable(
							"error",
							"That is the time it already has",
						);
					}
					const reader = await calendarReader(ctx);
					const zone = data.event.start?.timeZone ?? data.timeZone;
					await reader.client.events
						.patch({
							calendarId: "primary",
							eventId: refs.event,
							sendUpdates: "all",
							requestBody: {
								start: { dateTime: span.start, timeZone: zone, date: null },
								end: { dateTime: span.end, timeZone: zone, date: null },
							},
						})
						.catch(calendarWriteError);
					const moved = describeSpan(span, data.timeZone);
					const note = await noteGuests(
						ctx,
						data.event,
						input.note
							? {
									subject: `Updated: ${data.title}`,
									text: `${input.note}\n\nNew time: ${moved}`,
								}
							: null,
					);
					return {
						outcome: {
							rescheduled: true,
							...span,
							was: data.current,
							note: input.note ?? null,
							noteEmailed: note.emailed,
						},
						notice: note.trouble
							? { tone: "warn", text: `Moved to ${moved}. ${note.trouble}` }
							: { tone: "good", text: `Moved to ${moved}` },
					};
				},
				describeSpanError,
			),
		},
		cancel: {
			label: () => "Cancel event",
			style: "danger",
			role: "primary",
			applies: (data) => data.change === "cancel",
			available: (data) => data.cancelled || data.organizer || NOT_YOURS,
			confirm: (data) =>
				data.guests
					? `Cancel "${data.title}" and tell its ${data.guests} ${data.guests === 1 ? "guest" : "guests"}?`
					: `Cancel "${data.title}"?`,
			run: withInput(
				z.object({ note: noteSchema }).default({}),
				async ({ refs, data, ctx, input }) => {
					if (data.cancelled) {
						return {
							outcome: { cancelled: true, already: true },
							notice: { tone: "done", text: "Event cancelled" },
						};
					}
					const reader = await calendarReader(ctx);
					const already = await reader.client.events
						.delete({
							calendarId: "primary",
							eventId: refs.event,
							sendUpdates: "all",
						})
						.then(
							() => false,
							(error) => (eventGone(error) ? true : calendarWriteError(error)),
						);
					const note = await noteGuests(
						ctx,
						data.event,
						input.note && !already
							? { subject: `Cancelled: ${data.title}`, text: input.note }
							: null,
					);
					return {
						outcome: {
							cancelled: true,
							already,
							note: input.note ?? null,
							noteEmailed: note.emailed,
						},
						notice: note.trouble
							? { tone: "warn", text: `Event cancelled. ${note.trouble}` }
							: { tone: "done", text: "Event cancelled" },
					};
				},
			),
		},
		keep: {
			label: (data) => (data.change === "cancel" ? "Keep event" : "Keep as is"),
			style: "secondary",
			role: "dismiss",
			available: (data) => (data.cancelled ? CANCELLED : true),
			async run() {
				return { outcome: { kept: true } };
			},
		},
	},
});
