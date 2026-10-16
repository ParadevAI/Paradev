import { db } from "@superset/db/client";
import { automationRuns, automations, v2Hosts } from "@superset/db/schema";
import {
	planAllowsAutomations,
	planTierFromSubscription,
} from "@superset/shared/billing";
import { CLOUD_HOST_ID } from "@superset/shared/host-routing";
import { and, desc, eq, gt, ne } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../../../env";
import { dispatchAutomation } from "../../../automation/dispatch";
import { verifyOrgMembershipWithSubscription } from "../../../integration/utils";
import {
	type AutomationFailedView,
	type AutomationRunSession,
	type CardField,
	CardUnavailable,
	defineCard,
} from "../types";

const LATER_RUNS = 5;

function runSession(run: {
	v2WorkspaceId: string | null;
	cloudWorkspaceId: string | null;
	terminalSessionId: string | null;
}): AutomationRunSession | null {
	if (run.cloudWorkspaceId)
		return { location: "cloud", workspaceId: run.cloudWorkspaceId };
	if (run.v2WorkspaceId)
		return {
			location: "local",
			workspaceId: run.v2WorkspaceId,
			terminalId: run.terminalSessionId,
		};
	return null;
}

interface Data {
	view: AutomationFailedView;
	ownerUserId: string;
	automation: typeof automations.$inferSelect;
}

/**
 * An automation run that failed or never started. The card is the run as the
 * runs list shows it, with the host's own error and whether later runs went
 * through; Retry runs the automation again now.
 */
export const automationFailed = defineCard<{ run: string }, Data>({
	type: "superset.automation_failed",
	tier: "update",
	label: "Automation failed",
	ask: "Retry the run",
	brand: "superset",
	systemOnly: true,
	refs: z.object({ run: z.string().uuid() }),
	async resolve({ refs, ctx }) {
		const [row] = await db
			.select({ run: automationRuns, automation: automations })
			.from(automationRuns)
			.innerJoin(automations, eq(automations.id, automationRuns.automationId))
			.where(eq(automationRuns.id, refs.run))
			.limit(1);
		if (!row || row.run.organizationId !== ctx.organizationId)
			throw new CardUnavailable(
				"gone",
				"That run or its automation was deleted",
			);
		const { run, automation } = row;
		const [host, later] = await Promise.all([
			automation.targetHostId && automation.targetHostId !== CLOUD_HOST_ID
				? db.query.v2Hosts.findFirst({
						where: and(
							eq(v2Hosts.organizationId, automation.organizationId),
							eq(v2Hosts.machineId, automation.targetHostId),
						),
						columns: { name: true },
					})
				: undefined,
			db
				.select({
					id: automationRuns.id,
					status: automationRuns.status,
					createdAt: automationRuns.createdAt,
					v2WorkspaceId: automationRuns.v2WorkspaceId,
					cloudWorkspaceId: automationRuns.cloudWorkspaceId,
					terminalSessionId: automationRuns.terminalSessionId,
				})
				.from(automationRuns)
				.where(
					and(
						eq(automationRuns.automationId, automation.id),
						gt(automationRuns.createdAt, run.createdAt),
						ne(automationRuns.id, run.id),
					),
				)
				.orderBy(desc(automationRuns.createdAt))
				.limit(LATER_RUNS),
		]);
		const view: AutomationFailedView = {
			kind: "superset.automation_failed",
			automation: {
				id: automation.id,
				name: automation.name,
				agent: automation.agent,
				target:
					automation.targetHostId === CLOUD_HOST_ID
						? { kind: "cloud", name: null }
						: { kind: "host", name: host?.name ?? null },
			},
			run: {
				id: run.id,
				title: run.title,
				status: run.status,
				error: run.error,
				errorCode: run.errorCode,
				createdAt: run.createdAt.toISOString(),
				scheduledFor: run.scheduledFor?.toISOString() ?? null,
				session: runSession(run),
			},
			later: later.map((entry) => ({
				id: entry.id,
				status: entry.status,
				createdAt: entry.createdAt.toISOString(),
				session: runSession(entry),
			})),
		};
		const fields: CardField[] = [
			{ label: "Automation", value: automation.name },
			{ label: "Status", value: run.status },
			...(run.error ? [{ label: "Error", value: run.error }] : []),
		];
		return {
			title: "Automation failed",
			subtitle: automation.name,
			fields,
			body: run.error ?? undefined,
			view,
			data: { view, ownerUserId: automation.ownerUserId, automation },
		};
	},
	actions: {
		retry: {
			label: () => "Retry",
			style: "primary",
			role: "primary",
			available: (data, ctx) =>
				data.ownerUserId === ctx.readerId ||
				"Only the automation's owner can run it",
			async run({ data, ctx }) {
				const { subscription } = await verifyOrgMembershipWithSubscription(
					ctx.readerId,
					ctx.organizationId,
				);
				if (!planAllowsAutomations(planTierFromSubscription(subscription)))
					throw new CardUnavailable(
						"no_access",
						"Automations require the Pro plan",
					);
				if (data.automation.prompt.trim().length === 0)
					throw new CardUnavailable(
						"error",
						"The automation has no instructions",
					);
				const outcome = await dispatchAutomation({
					automation: data.automation,
					scheduledFor: new Date(),
					relayUrl: env.RELAY_URL,
				});
				if (outcome.status === "conflict")
					throw new CardUnavailable(
						"error",
						"A run of this automation is already in progress",
					);
				if (outcome.status !== "dispatched")
					throw new CardUnavailable("error", outcome.error);
				return {
					outcome: { retried: true, runId: outcome.runId },
					notice: { tone: "good", text: "Running again" },
				};
			},
		},
	},
});
