import { string, table } from "@superset/cli-framework";
import { normalizeAutomationGroup } from "@superset/shared/automation-group";
import { command } from "../../../lib/command";
import { formatAutomationDate } from "../format";

export default command({
	description: "List automations in the organization",
	options: {
		name: string()
			.alias("n")
			.desc("Filter by name (case-insensitive substring match)"),
		group: string().desc("Only automations in this group (case-insensitive)"),
	},
	run: async ({ ctx, options }) => {
		const rows = await ctx.api.automation.list.query(
			options.name ? { name: options.name } : undefined,
		);
		const group = normalizeAutomationGroup(options.group)?.toLowerCase();
		if (!group) return rows;
		return rows.filter((row) => row.group?.toLowerCase() === group);
	},
	display: (data) =>
		table(
			(data as Record<string, unknown>[]).map((row) => ({
				id: row.id,
				name: row.name,
				group: row.group ?? "—",
				agent: row.agent,
				schedule:
					row.scheduleText ??
					row.rrule ??
					((row.triggerCount as number) > 0
						? "event triggered"
						: "no triggers"),
				enabled: row.enabled ? "yes" : "no",
				nextRun: formatAutomationDate(
					row.nextRunAt as Date | string | null | undefined,
					row.timezone as string | null | undefined,
				),
			})),
			["id", "name", "group", "agent", "schedule", "enabled", "nextRun"],
			["ID", "NAME", "GROUP", "AGENT", "SCHEDULE", "ENABLED", "NEXT RUN"],
		),
});
