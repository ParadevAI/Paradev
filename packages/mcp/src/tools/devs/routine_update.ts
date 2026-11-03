import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export const tool = defineTool({
	name: "routine_update",
	callers: ["dev"],
	description:
		"Your routines: things that wake you later on their own. Use it when someone wants something on a schedule ('every weekday at 9'), later ('in 3 minutes', 'tomorrow at noon'), or whenever something happens ('when a PR opens in owner/repo', 'when someone posts in #roster'). mode view lists them; create makes one; update changes one (enabled true resumes it); pause stops one. You can't delete routines; people can. A routine runs at most once an hour, for the person who asked, and you answer it at reply_to. Ask for their time zone if you don't know it. Update a routine instead of making a second one for the same ask.",
	inputSchema: {
		mode: z.enum(["view", "create", "update", "pause"]),
		routine_id: z.string().optional(),
		reply_to: z
			.string()
			.optional()
			.describe(
				"create: where its runs answer, usually the reply_to of the message you are answering.",
			),
		title: z
			.string()
			.optional()
			.describe("A short name, like 'Standup digest'."),
		prompt: z
			.string()
			.optional()
			.describe(
				"What to do when it runs, as an instruction to yourself: 'Tell Satya what merged in owner/repo yesterday.'",
			),
		schedule: z
			.object({
				start: z
					.string()
					.describe(
						"The first run, ISO 8601 with offset: 2026-10-29T09:00:00-07:00.",
					),
				repeat: z
					.string()
					.optional()
					.describe(
						"An RRULE body such as FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0. Leave it out to run once.",
					),
				timezone: z
					.string()
					.describe("IANA time zone, like America/Los_Angeles."),
			})
			.optional()
			.describe("When it runs. Leave it out for a routine that only watches."),
		watch_channels: z
			.array(z.string())
			.optional()
			.describe(
				"Channel names to watch, like ['roster']. Each new message there wakes you.",
			),
		include_thread_replies: z.boolean().optional(),
		watch_events: z
			.array(z.record(z.string(), z.unknown()))
			.optional()
			.describe(
				'Events from connected tools. GitHub: {"kind":"github","event":"pull_request.opened","repositories":{"mode":"list","ids":["owner/name"]}}. Other GitHub events include pull_request.merged, pull_request.closed, push_to_branch, checks_completed, pr_review_submitted.any, issue_comment, release.published.',
			),
		enabled: z.boolean().optional(),
	},
	handler: async (input, ctx) => {
		const tools = createMcpCaller(ctx).devTools;
		if (input.mode === "view") return tools.listRoutines();
		const changes = {
			title: input.title,
			prompt: input.prompt,
			...(input.schedule
				? {
						schedule: {
							start: input.schedule.start,
							repeat: input.schedule.repeat ?? null,
							timezone: input.schedule.timezone,
						},
					}
				: {}),
			watchChannels: input.watch_channels,
			includeThreadReplies: input.include_thread_replies,
			watchEvents: input.watch_events as never,
			enabled: input.enabled,
		};
		if (input.mode === "create") {
			return tools.createRoutine({ ...changes, replyTo: input.reply_to ?? "" });
		}
		if (!input.routine_id) throw new Error(`${input.mode} needs routine_id`);
		return tools.updateRoutine(
			input.mode === "pause"
				? { routineId: input.routine_id, enabled: false }
				: { ...changes, routineId: input.routine_id },
		);
	},
});
