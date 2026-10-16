import { z } from "zod";
import {
	type CardField,
	CardUnavailable,
	defineCard,
	type SlackStatusView,
	withInput,
} from "../types";
import {
	dayAndTime,
	type Reader,
	readerUser,
	slackReader,
} from "./slackCompose";
import { toPerson } from "./slackMessages";
import { customEmoji, isSlack, slack } from "./slackWorkspace";

interface Refs {
	mode: "status" | "pause";
	text?: string;
	emoji?: string;
	until?: string;
	pause?: boolean;
}

interface Data {
	reader: Reader;
	mode: Refs["mode"];
	timezone: string;
	/** Unix seconds a pause the reader set by hand runs to; 0 when there is none. */
	snoozedUntil: number;
}

const STATUS_MAX = 100;
const EMOJI = /^(:[\p{L}\p{N}_+'-]{1,100}:(:skin-tone-[2-6]:)?)?$/u;
const DEFAULT_EMOJI = ":speech_balloon:";
const LEAD_MS = 60_000;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const PAUSE_NEEDS_END =
	"Pick when the status ends to pause notifications with it";

const ok = z.object({ ok: z.boolean() });
const iso = (seconds: number | undefined) =>
	seconds ? new Date(seconds * 1000).toISOString() : null;

function ahead(time: string | null | undefined): number | null {
	if (!time) return null;
	const at = Date.parse(time);
	if (at < Date.now() + LEAD_MS)
		throw new CardUnavailable("error", "That time has passed");
	if (at > Date.now() + YEAR_MS)
		throw new CardUnavailable("error", "Pick a time within a year");
	return at;
}

/** Slack takes whole minutes, and a pause the reader already has that runs longer is left as it is. Answers the time notifications resume. */
async function pauseUntil(data: Data, until: number): Promise<number> {
	if (data.snoozedUntil * 1000 >= until) return data.snoozedUntil * 1000;
	const minutes = Math.max(1, Math.ceil((until - Date.now()) / 60_000));
	const set = await slack(
		data.reader.token,
		"dnd.setSnooze",
		z.object({ snooze_endtime: z.number().optional() }),
		{ num_minutes: String(minutes) },
	);
	return set.snooze_endtime ? set.snooze_endtime * 1000 : until;
}

export const slackStatus = defineCard<Refs, Data>({
	type: "slack.status",
	label: "Slack status",
	ask: "Approve status",
	brand: "slack",
	refs: z.object({
		mode: z.enum(["status", "pause"]),
		text: z.string().max(STATUS_MAX).optional(),
		/** A Slack emoji name between colons, such as `:palm_tree:`. */
		emoji: z.string().max(140).optional(),
		until: z.string().datetime({ offset: true }).optional(),
		pause: z.boolean().optional(),
	}),
	async resolve({ refs, ctx }) {
		const reader = await slackReader(ctx);
		const [user, dnd, emoji] = await Promise.all([
			readerUser(reader),
			slack(
				reader.token,
				"dnd.info",
				z.object({
					snooze_enabled: z.boolean().optional(),
					snooze_endtime: z.number().optional(),
					dnd_enabled: z.boolean().optional(),
					next_dnd_start_ts: z.number().optional(),
					next_dnd_end_ts: z.number().optional(),
				}),
				{},
			),
			customEmoji(reader.token),
		]);
		const self = { ...toPerson(user), isReader: true };
		const timezone = self.timezone ?? "UTC";
		const until = refs.until ? Date.parse(refs.until) : null;
		const proposedUntil =
			until !== null && until > Date.now()
				? new Date(until).toISOString()
				: null;
		const current = {
			text: user.profile?.status_text ?? "",
			emoji: user.profile?.status_emoji ?? "",
			until: iso(user.profile?.status_expiration),
			pausedUntil: dnd.snooze_enabled
				? iso(dnd.snooze_endtime)
				: dnd.dnd_enabled && (dnd.next_dnd_start_ts ?? 0) * 1000 <= Date.now()
					? iso(dnd.next_dnd_end_ts)
					: null,
		};
		const view: SlackStatusView = {
			kind: "slack.status",
			workspace: reader.workspace,
			reader: self,
			mode: refs.mode,
			current,
			proposed: {
				text: refs.text ?? "",
				emoji: EMOJI.test(refs.emoji ?? "") ? (refs.emoji ?? "") : "",
				until: refs.mode === "status" ? proposedUntil : null,
				pause: refs.mode === "status" ? (refs.pause ?? false) : true,
				pauseUntil: refs.mode === "pause" ? proposedUntil : null,
			},
			stale: until !== null && until <= Date.now(),
			timezone,
			emoji,
		};
		const fields: CardField[] = [
			...(refs.mode === "status"
				? [
						{
							label: "Status",
							value: `${view.proposed.emoji} ${refs.text ?? ""}`.trim(),
						},
					]
				: []),
			...(proposedUntil
				? [
						{
							label: "Until",
							value: dayAndTime(Date.parse(proposedUntil), timezone),
						},
					]
				: []),
			...(view.proposed.pause
				? [{ label: "Notifications", value: "Paused" }]
				: []),
		];
		return {
			title: refs.mode === "status" ? "Set your status" : "Pause notifications",
			subtitle: reader.workspace,
			fields,
			view,
			data: {
				reader,
				mode: refs.mode,
				timezone,
				snoozedUntil: dnd.snooze_enabled ? (dnd.snooze_endtime ?? 0) : 0,
			},
		};
	},
	actions: {
		set_status: {
			label: () => "Set status",
			style: "primary",
			role: "primary",
			applies: (data) => data.mode === "status",
			run: withInput(
				z.object({
					text: z.string().trim().max(STATUS_MAX),
					emoji: z.string().regex(EMOJI),
					until: z.string().datetime({ offset: true }).nullable(),
					pause: z.boolean().default(false),
				}),
				async ({ data, input }) => {
					if (!input.text && !input.emoji)
						throw new CardUnavailable(
							"error",
							"A status needs words or an emoji",
						);
					const until = ahead(input.until);
					if (input.pause && until === null)
						throw new CardUnavailable("error", PAUSE_NEEDS_END);
					const emoji = input.emoji || DEFAULT_EMOJI;
					await slack(
						data.reader.token,
						"users.profile.set",
						ok,
						{
							profile: {
								status_text: input.text,
								status_emoji: emoji,
								status_expiration:
									until === null ? 0 : Math.floor(until / 1000),
							},
						},
						true,
					);
					const when =
						until === null ? "" : ` until ${dayAndTime(until, data.timezone)}`;
					const status = {
						status: input.text,
						emoji,
						until: until === null ? null : new Date(until).toISOString(),
					};
					if (!input.pause || until === null)
						return {
							outcome: { ...status, pausedUntil: null },
							notice: { tone: "good", text: `Your status is set${when}` },
						};
					try {
						const resumes = await pauseUntil(data, until);
						return {
							outcome: {
								...status,
								pausedUntil: new Date(resumes).toISOString(),
							},
							notice: {
								tone: "good",
								text: `Your status is set${when}, with notifications paused`,
							},
						};
					} catch (error) {
						return {
							outcome: { ...status, pausedUntil: null },
							notice: {
								tone: "warn",
								text: `Your status is set${when}. Notifications were not paused: ${error instanceof CardUnavailable ? error.text : "Slack did not answer"}`,
							},
						};
					}
				},
			),
		},
		pause: {
			label: () => "Pause notifications",
			style: "primary",
			role: "primary",
			applies: (data) => data.mode === "pause",
			run: withInput(
				z.object({ until: z.string().datetime({ offset: true }) }),
				async ({ data, input }) => {
					const resumes = await pauseUntil(data, ahead(input.until) ?? 0);
					return {
						outcome: { pausedUntil: new Date(resumes).toISOString() },
						notice: {
							tone: "good",
							text: `Notifications are paused until ${dayAndTime(resumes, data.timezone)}`,
						},
					};
				},
			),
		},
		resume: {
			label: () => "Resume notifications",
			style: "secondary",
			role: "other",
			applies: (data) => data.mode === "pause" && data.snoozedUntil > 0,
			confirm: () => "Resume your Slack notifications now?",
			async run({ data }) {
				await slack(data.reader.token, "dnd.endSnooze", ok, {}, true).catch(
					(error) => {
						if (!isSlack(error, "snooze_not_active")) throw error;
					},
				);
				return {
					outcome: { pausedUntil: null },
					notice: { tone: "good", text: "Notifications are on again" },
				};
			},
		},
		dismiss: {
			label: () => "Leave it",
			style: "secondary",
			role: "dismiss",
			async run() {
				return { outcome: { changed: false } };
			},
		},
	},
});
