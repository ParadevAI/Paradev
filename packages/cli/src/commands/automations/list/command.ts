import { table } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "List automations in the organization",
	run: async ({ ctx }) => {
		return ctx.api.automation.list.query();
	},
	display: (data) =>
		table(
			(data as Record<string, unknown>[]).map((row) => ({
				id: row.id,
				name: row.name,
				agent: (row.agentConfig as { id?: string } | null)?.id,
				schedule: row.scheduleText ?? row.rrule,
				enabled: row.enabled ? "yes" : "no",
				nextRun: row.nextRunAt ?? "—",
			})),
			["id", "name", "agent", "schedule", "enabled", "nextRun"],
			["ID", "NAME", "AGENT", "SCHEDULE", "ENABLED", "NEXT RUN"],
		),
});
