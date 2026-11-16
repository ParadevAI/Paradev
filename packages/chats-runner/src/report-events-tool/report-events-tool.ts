import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";

const EventReport = Type.Object({
	event: Type.Union([Type.Integer({ minimum: 1 }), Type.String()], {
		description:
			"The event's number in the ## Events input (1, 2, …) or its id",
	}),
	action: Type.Union(
		[Type.Literal("told"), Type.Literal("acted"), Type.Literal("skipped")],
		{
			description:
				"told: you told the chat about it; acted: you did something with it (a draft, a comment, a task); skipped: nothing needed",
		},
	),
	note: Type.String({
		maxLength: 140,
		description:
			"A few words on what you did or why not, shown beside the event to its person (under 140 characters)",
	}),
});

const ReportParams = Type.Object({
	events: Type.Array(EventReport, {
		minItems: 1,
		description: "Every event of this turn, once each",
	}),
});

/** One line of the report: what the Dev did with one event. */
export type EventReport = Static<typeof EventReport>;

/** Records the reports for the running `## Events` turn's batch; resolves with how many events they covered. */
export type ReportEvents = (events: EventReport[]) => Promise<number>;

/** `POST <api>/cli/triggers/events/report`, naming the chat (the box's proxy adds its credential). */
export function reportsOverHttp(apiUrl: string, chatId: string): ReportEvents {
	const url = `${apiUrl.replace(/\/+$/, "")}/cli/triggers/events/report`;
	return async (events) => {
		const res = await fetch(url, {
			method: "POST",
			headers: { "x-dev-chat": chatId, "content-type": "application/json" },
			body: JSON.stringify({ events }),
		});
		const body = (await res.json().catch(() => ({}))) as {
			message?: string;
			reported?: number;
		};
		if (!res.ok)
			throw new Error(body.message ?? `The API answered ${res.status}`);
		return body.reported ?? events.length;
	};
}

/**
 * The `report_events` tool, in a trigger's own session only: says what the Dev did with each event of the batch
 * (told the chat, acted, skipped) with a short note, so the person's event list shows it per event. The turn's final
 * message stays the batch's one-line summary.
 */
export function reportEventsExtension(report: ReportEvents) {
	return (pi: ExtensionAPI) => {
		pi.registerTool({
			name: "report_events",
			label: "Report events",
			description:
				"Say what you did with each event of this ## Events turn, once for all of them, before your final line: told (you told the chat), acted (a draft, a comment, a task), or skipped, each with a short note. Reporting an event again replaces what you said.",
			promptSnippet: "Report what you did with each event of an ## Events turn",
			parameters: ReportParams,
			executionMode: "sequential",
			async execute(_toolCallId, params) {
				const events = params.events.map((e) => ({
					...e,
					note: e.note.trim(),
				}));
				const reported = await report(events);
				const text = `Reported ${reported} ${reported === 1 ? "event" : "events"}. End with a one-line summary of the batch.`;
				return {
					content: [{ type: "text" as const, text }],
					details: undefined,
				};
			},
		});
	};
}
