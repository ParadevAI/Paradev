import { z } from "zod";
import {
	type CardField,
	CardUnavailable,
	defineCard,
	type SlackReminderView,
	withInput,
} from "../types";
import {
	dayAndTime,
	type Reader,
	readerUser,
	slackReader,
} from "./slackCompose";
import { toPerson } from "./slackMessages";
import { slack } from "./slackWorkspace";

interface Refs {
	text: string;
	time?: string;
}

interface Data {
	reader: Reader;
	timezone: string;
}

const TEXT_MAX = 500;
const LEAD_MS = 30_000;
const YEARS_MAX = 5;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/** A reminder Slackbot sends the reader at a time; it is theirs alone. */
export const slackReminder = defineCard<Refs, Data>({
	type: "slack.reminder",
	label: "Slack reminder",
	ask: "Approve reminder",
	brand: "slack",
	refs: z.object({
		text: z.string().trim().min(1).max(TEXT_MAX),
		time: z.string().datetime({ offset: true }).optional(),
	}),
	async resolve({ refs, ctx }) {
		const reader = await slackReader(ctx);
		const self = { ...toPerson(await readerUser(reader)), isReader: true };
		const timezone = self.timezone ?? "UTC";
		const time = refs.time ? Date.parse(refs.time) : null;
		const view: SlackReminderView = {
			kind: "slack.reminder",
			workspace: reader.workspace,
			reader: self,
			text: refs.text,
			time:
				time !== null && time > Date.now()
					? new Date(time).toISOString()
					: null,
			stale: time !== null && time <= Date.now(),
			timezone,
		};
		const fields: CardField[] = [
			{ label: "Remind", value: "You" },
			...(view.time
				? [
						{
							label: "When",
							value: dayAndTime(Date.parse(view.time), timezone),
						},
					]
				: []),
		];
		return {
			title: refs.text.split("\n")[0]?.slice(0, 120) ?? "Reminder",
			subtitle: reader.workspace,
			fields,
			body: refs.text,
			view,
			data: { reader, timezone },
		};
	},
	actions: {
		remind: {
			label: () => "Set reminder",
			style: "primary",
			role: "primary",
			run: withInput(
				z.object({
					text: z.string().trim().min(1).max(TEXT_MAX),
					time: z.string().datetime({ offset: true }),
				}),
				async ({ data, input }) => {
					const at = Date.parse(input.time);
					if (at < Date.now() + LEAD_MS)
						throw new CardUnavailable("error", "That time has passed");
					if (at > Date.now() + YEARS_MAX * YEAR_MS)
						throw new CardUnavailable(
							"error",
							"Slack reminds up to 5 years ahead",
						);
					const made = await slack(
						data.reader.token,
						"reminders.add",
						z.object({ reminder: z.object({ id: z.string() }) }),
						{ text: input.text, time: Math.floor(at / 1000) },
						true,
					);
					return {
						outcome: {
							reminder: made.reminder.id,
							time: new Date(at).toISOString(),
						},
						notice: {
							tone: "good",
							text: `Slack reminds you on ${dayAndTime(at, data.timezone)}`,
						},
					};
				},
			),
		},
		dismiss: {
			label: () => "No reminder",
			style: "secondary",
			role: "dismiss",
			async run() {
				return { outcome: { reminded: false } };
			},
		},
	},
});
