import { FEATURE_FLAGS } from "@superset/shared/constants";
import {
	ORG_PRESENCE_AWAY_AFTER_MS,
	ORG_PRESENCE_PING,
	ORG_PRESENCE_PING_MS,
	type OrgPresenceReport,
	type OrgPresenceStatus,
	parseOrgPresenceMessage,
} from "@superset/shared/org-presence";
import {
	parseRealtimeNudgeMessage,
	REALTIME_NUDGE_KINDS,
	type RealtimeNudgeKind,
	type RealtimeUpdate,
	realtimeNudgesPath,
} from "@superset/shared/realtime";
import { createRelaySocket } from "@superset/workspace-client";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useEffect } from "react";
import { env } from "renderer/env.renderer";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { ensureFreshJwt } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useOrgPresenceStore } from "renderer/stores/org-presence";

/**
 * One socket per window to the realtime Worker. The API sends a nudge after
 * it writes hosts, cloud workspaces, pull requests, automation runs or organization plugins: a kind refetches the matching query,
 * a patch is applied to the cache without one, which is why neither polls.
 * A reopen refetches everything once, since nudges sent while the socket
 * was down are gone. Rendered inside the providers: the subscription needs
 * the active organization.
 *
 * With channels on, the same socket carries presence: the window pings so
 * the hub can drop it if it goes silent, reports away after ten minutes
 * without input, and hears who else in the organization has a window open.
 * The hub only sends presence to windows that report it.
 */
export function RealtimeNudges() {
	const organizationId = useActiveOrganizationId();
	const utils = cloudTrpc.useUtils();
	const reportsPresence =
		useFeatureFlagEnabled(FEATURE_FLAGS.CHANNELS) === true;

	useEffect(() => {
		if (!organizationId) return;

		// A hidden window marks the query stale and refetches on focus, the way
		// its polls used to pause in the background.
		const invalidate = (kinds: readonly RealtimeNudgeKind[]) => {
			const options = {
				refetchType: document.hidden ? ("none" as const) : ("active" as const),
			};
			for (const kind of kinds) {
				switch (kind) {
					case "hosts":
						void utils.host.roster.invalidate(undefined, options);
						break;
					case "cloud_workspaces":
						void utils.cloudWorkspace.invalidate(undefined, options);
						void utils.suggestion.invalidate(undefined, options);
						void utils.taskLabel.list.invalidate(undefined, options);
						void utils.taskProject.list.invalidate(undefined, options);
						break;
					case "pull_requests":
						void utils.cloudWorkspace.pullRequests.invalidate(
							undefined,
							options,
						);
						break;
					case "plugins":
						void utils.plugins.list.invalidate(undefined, options);
						void utils.plugins.organization.invalidate(undefined, options);
						break;
					case "automation_runs":
						void utils.automation.latestRuns.invalidate(undefined, options);
						void utils.automation.listRuns.invalidate(undefined, options);
						void utils.automation.listOrgRuns.invalidate(undefined, options);
						void utils.automation.orgRunStats.invalidate(undefined, options);
						break;
				}
			}
		};

		const patch = (updates: readonly RealtimeUpdate[]) => {
			if (updates.length === 0) return;
			utils.cloudWorkspace.list.setData({ organizationId }, (rows) =>
				rows?.map((row) => {
					const update = updates.find((u) => u.workspaceId === row.id);
					if (!update) return row;
					return {
						...row,
						agentStatus: update.agentStatus,
						agentStatusAt: new Date(update.agentStatusAt),
					};
				}),
			);
		};

		const socket = createRelaySocket({
			buildUrl: () =>
				`${env.REALTIME_URL}${realtimeNudgesPath(organizationId)}`,
			getToken: () => ensureFreshJwt(),
			minReconnectionDelay: 1_000,
			maxReconnectionDelay: 30_000,
		});
		let status: OrgPresenceStatus = "active";
		let lastInput = Date.now();
		const report = () => {
			if (!reportsPresence) return;
			const message: OrgPresenceReport = { type: "presence", status };
			socket.send(JSON.stringify(message));
		};
		const onInput = () => {
			lastInput = Date.now();
			if (status === "active") return;
			status = "active";
			report();
		};
		const checkAway = () => {
			if (status === "away") return;
			if (Date.now() - lastInput < ORG_PRESENCE_AWAY_AFTER_MS) return;
			status = "away";
			report();
		};
		const inputEvents = reportsPresence
			? ["pointerdown", "pointermove", "keydown", "focus"]
			: [];
		for (const name of inputEvents) {
			window.addEventListener(name, onInput, { passive: true });
		}
		const ping = reportsPresence
			? setInterval(() => socket.send(ORG_PRESENCE_PING), ORG_PRESENCE_PING_MS)
			: undefined;
		const awayCheck = reportsPresence
			? setInterval(checkAway, ORG_PRESENCE_PING_MS)
			: undefined;

		// The first open follows the queries' own initial fetch; only a reopen
		// can have missed something.
		let opened = false;
		socket.addEventListener("open", () => {
			report();
			if (opened) invalidate(REALTIME_NUDGE_KINDS);
			opened = true;
		});
		socket.addEventListener("message", (event) => {
			const presence = parseOrgPresenceMessage(event.data);
			if (presence) {
				useOrgPresenceStore.getState().setUsers(presence.users);
				return;
			}
			const message = parseRealtimeNudgeMessage(event.data);
			if (!message) return;
			patch(message.updates);
			invalidate(message.kinds);
		});
		return () => {
			for (const name of inputEvents) window.removeEventListener(name, onInput);
			clearInterval(ping);
			clearInterval(awayCheck);
			useOrgPresenceStore.getState().setUsers({});
			socket.close(1000, "unsubscribed");
		};
	}, [organizationId, utils, reportsPresence]);

	return null;
}
