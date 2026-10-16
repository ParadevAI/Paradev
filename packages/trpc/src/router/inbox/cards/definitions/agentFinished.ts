import { BUILTIN_AGENT_IDS } from "@superset/shared/agent-catalog";
import { z } from "zod";
import { archiveCloudWorkspace } from "../../../cloud-workspace/archive";
import {
	type AgentFinishedView,
	type CardField,
	CardUnavailable,
	defineCard,
} from "../types";
import { loadWorkspace, type WorkspaceRecord } from "./supersetWorkspace";
import { sendToWorkspaceAgent } from "./workspaceHost";

const FEEDBACK_MAX = 8000;

interface Data {
	record: WorkspaceRecord;
	agent: string;
	archived: boolean;
}

/**
 * An agent's turn is over and it wants the person to look: the workspace as
 * the sidebar draws it, with what changed on its PR. Feedback goes back to the
 * same agent session; archiving puts the workspace away.
 */
export const agentFinished = defineCard<
	{ workspace: string; host?: string; agent?: string },
	Data
>({
	type: "superset.agent_finished",
	tier: "finished",
	label: "Agent finished",
	ask: "Review the work",
	brand: "superset",
	refs: z.object({
		workspace: z.string().uuid(),
		/** The machine a local workspace lives on; cloud workspaces need none. */
		host: z
			.string()
			.regex(/^[a-zA-Z0-9_-]{1,128}$/)
			.optional(),
		/** The agent CLI that wrote this card, so feedback lands in the same session. */
		agent: z.enum(BUILTIN_AGENT_IDS).optional(),
	}),
	async resolve({ refs, ctx }) {
		const { record, view } = await loadWorkspace(
			ctx.organizationId,
			ctx.readerId,
			refs.workspace,
			refs.host ?? ctx.card?.hostId ?? undefined,
		);
		const pr = view.pullRequest;
		const fields: CardField[] = [
			{ label: "Workspace", value: view.name },
			...(view.branch
				? [{ label: "Branch", value: view.branch, mono: true }]
				: []),
			...(pr
				? [{ label: "Pull request", value: `#${pr.number} ${pr.state}` }]
				: []),
			...(view.changes
				? [
						{
							label: "Changes",
							value: `+${view.changes.additions} −${view.changes.deletions} in ${view.changes.files} files`,
						},
					]
				: []),
		];
		const resolvedView: AgentFinishedView = {
			kind: "superset.agent_finished",
			workspace: view,
		};
		return {
			title: "Agent finished",
			subtitle: view.name,
			fields,
			view: resolvedView,
			data: {
				record,
				agent: refs.agent ?? "claude",
				archived:
					record.location === "cloud" && record.row.status === "deleted",
			},
		};
	},
	actions: {
		send_back: {
			label: () => "Send back",
			style: "primary",
			role: "primary",
			input: "What the agent should do next",
			async run({ data, ctx, input }) {
				const feedback = input?.trim() ?? "";
				if (!feedback)
					throw new CardUnavailable(
						"error",
						"Write what the agent should change",
					);
				if (feedback.length > FEEDBACK_MAX)
					throw new CardUnavailable("error", "That feedback is too long");
				if (ctx.card?.waiting) {
					return { outcome: { feedback, delivered: "wait" } };
				}
				const run = await sendToWorkspaceAgent({
					record: data.record,
					userId: ctx.readerId,
					agent: data.agent,
					prompt: feedback,
					continueTerminalId: ctx.card?.agentSessionId,
				});
				return {
					outcome: {
						feedback,
						delivered: "session",
						terminalId: run.sessionId,
					},
					notice: { tone: "good", text: "Sent to the agent" },
				};
			},
		},
		archive: {
			label: () => "Archive workspace",
			style: "secondary",
			role: "other",
			applies: (data) => data.record.location === "cloud",
			confirm: () =>
				"The cloud workspace stops now. It can be restored for 7 days, then it is deleted.",
			available: (data) =>
				data.archived ? "That workspace is already archived" : true,
			async run({ data, ctx }) {
				if (data.record.location !== "cloud")
					throw new CardUnavailable(
						"error",
						"Only a cloud workspace archives here",
					);
				await archiveCloudWorkspace(data.record.row, ctx.readerId);
				return {
					outcome: { archived: true },
					notice: { tone: "done", text: "Archived" },
				};
			},
		},
	},
});
