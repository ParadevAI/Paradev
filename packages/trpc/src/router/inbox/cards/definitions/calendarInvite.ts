import type { calendar_v3 } from "@googleapis/calendar";
import { z } from "zod";
import {
	type CalendarInviteView,
	type CalendarResponse,
	type CardField,
	defineCard,
	withInput,
} from "../types";
import {
	anchorOf,
	type CalendarReader,
	calendarReader,
	DRAFT_MAX,
	describeSpanError,
	EVENT_ID,
	eventView,
	fetchEvent,
	NOTE_MAX,
	noteSchema,
	spanSchema,
	weekFrom,
} from "./calendarCard";
import { calendarWriteError } from "./calendarClient";
import { conflictsWith, describeSpan } from "./calendarEvents";
import { canMailNote, mailNote } from "./calendarMail";

interface Refs {
	event: string;
	note?: string;
}

interface Data {
	event: calendar_v3.Schema$Event;
	title: string;
	timeZone: string;
	organizerEmail: string;
	unanswerable: string | null;
}

const answerSchema = z.enum(["accepted", "declined", "tentative"]);

const ANSWER_WORDS: Record<z.infer<typeof answerSchema>, string> = {
	accepted: "Yes",
	declined: "No",
	tentative: "Maybe",
};

const NOT_A_GUEST = "You're not a guest of this event";
const CANCELLED = "This event was cancelled";
const ORGANIZER_NOT_EMAILED =
	"Your answer carries the proposal, but the organizer could not be emailed";

/**
 * Google replaces the whole guest list on a patch, so the others go back as
 * they were, and the event's etag makes Google refuse the write if anyone
 * answered in between.
 */
async function answer(
	reader: CalendarReader,
	event: calendar_v3.Schema$Event,
	change: { response: CalendarResponse; comment?: string },
): Promise<void> {
	const attendees = (event.attendees ?? []).map((attendee) =>
		attendee.self
			? {
					...attendee,
					responseStatus: change.response,
					...(change.comment === undefined ? {} : { comment: change.comment }),
				}
			: attendee,
	);
	await reader.client.events
		.patch(
			{
				calendarId: "primary",
				eventId: event.id ?? "",
				sendUpdates: "all",
				requestBody: { attendees },
			},
			event.etag ? { headers: { "If-Match": event.etag } } : {},
		)
		.catch(calendarWriteError);
}

export const calendarInvite = defineCard<Refs, Data>({
	type: "google_calendar.invite",
	label: "Calendar invitation",
	ask: "Answer invite",
	brand: "google_calendar",
	refs: z.object({
		event: z.string().regex(EVENT_ID),
		note: z.string().max(DRAFT_MAX).optional(),
	}),
	async resolve({ refs, ctx }) {
		const reader = await calendarReader(ctx);
		const event = await fetchEvent(reader.client, refs.event);
		const [{ timeZone, window, busy }, canEmailNote] = await Promise.all([
			weekFrom(reader, anchorOf(event), new Set([refs.event])),
			canMailNote(ctx),
		]);
		const facts = eventView(event, reader, timeZone);
		const mine = facts.guests.find((guest) => guest.self);
		const unanswerable = facts.cancelled
			? CANCELLED
			: mine
				? null
				: NOT_A_GUEST;
		const view: CalendarInviteView = {
			kind: "google_calendar.invite",
			account: { email: reader.email, photo: reader.photo },
			event: facts,
			response: mine?.response ?? "needsAction",
			conflicts: conflictsWith(facts, busy),
			busy,
			window,
			note: refs.note ?? "",
			canRespond: unanswerable === null,
			canEmailNote,
		};
		const when = describeSpan(facts, timeZone);
		const fields: CardField[] = [
			{ label: "When", value: when },
			{
				label: "Organizer",
				value: facts.organizer.name ?? facts.organizer.email,
			},
			{ label: "Guests", value: String(facts.guests.length) },
			...(view.conflicts.length
				? [
						{
							label: "Conflicts",
							value: view.conflicts.map((c) => c.title).join(", "),
						},
					]
				: []),
		];
		return {
			title: facts.title,
			subtitle: when,
			fields,
			body: facts.description?.slice(0, 500) || undefined,
			view,
			data: {
				event,
				title: facts.title,
				timeZone,
				organizerEmail:
					facts.organizer.self ||
					facts.organizer.email.endsWith(".calendar.google.com")
						? ""
						: facts.organizer.email,
				unanswerable,
			},
		};
	},
	actions: {
		rsvp: {
			label: () => "Answer",
			style: "primary",
			role: "primary",
			available: (data) => data.unanswerable ?? true,
			run: withInput(
				z.object({ response: answerSchema, note: noteSchema }),
				async ({ data, ctx, input }) => {
					const reader = await calendarReader(ctx);
					await answer(reader, data.event, {
						response: input.response,
						...(input.note === undefined ? {} : { comment: input.note }),
					});
					return {
						outcome: { response: input.response, note: input.note ?? null },
						notice: {
							tone: "good",
							text: `You answered ${ANSWER_WORDS[input.response]}`,
						},
					};
				},
			),
		},
		propose: {
			label: () => "Propose a new time",
			style: "secondary",
			role: "other",
			available: (data) => data.unanswerable ?? true,
			run: withInput(
				spanSchema.and(
					z.object({
						response: answerSchema.default("tentative"),
						note: noteSchema,
					}),
				),
				async ({ data, ctx, input }) => {
					const reader = await calendarReader(ctx);
					const proposed = describeSpan(input, data.timeZone);
					const comment = [`Proposed new time: ${proposed}`, input.note]
						.filter(Boolean)
						.join("\n")
						.slice(0, NOTE_MAX);
					await answer(reader, data.event, {
						response: input.response,
						comment,
					});
					const mailed = await mailNote(ctx, {
						to: data.organizerEmail ? [data.organizerEmail] : [],
						subject: `Proposed new time: ${data.title}`,
						text: comment,
					}).catch(() => false);
					return {
						outcome: {
							proposed: { start: input.start, end: input.end },
							response: input.response,
							note: input.note ?? null,
							organizerEmailed: mailed,
						},
						notice: !data.organizerEmail
							? { tone: "good", text: "Proposal added to your answer" }
							: mailed
								? { tone: "good", text: "Proposal sent" }
								: { tone: "warn", text: ORGANIZER_NOT_EMAILED },
					};
				},
				describeSpanError,
			),
		},
	},
});
