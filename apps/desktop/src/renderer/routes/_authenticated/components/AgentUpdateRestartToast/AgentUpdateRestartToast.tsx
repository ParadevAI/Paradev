import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

const OUTDATED_CHECK_INTERVAL_MS = 5 * 60_000;
const TOAST_ID = "agent-update-restart";

/**
 * Offers to restart Claude agents still running an older binary after a
 * Claude Code update. Only agents between turns are offered; a busy one is
 * offered once its turn ends. Each session is offered once per app run.
 */
export function AgentUpdateRestartToast() {
	const { t } = useLingui();
	const { activeHostUrl } = useLocalHostService();
	const offeredTerminalIdsRef = useRef(new Set<string>());

	const { data: outdatedSessions, refetch } = useQuery({
		queryKey: ["terminal-agents-outdated-sessions", activeHostUrl],
		enabled: !!activeHostUrl,
		refetchInterval: OUTDATED_CHECK_INTERVAL_MS,
		queryFn: () => {
			if (!activeHostUrl) return [];
			return getHostServiceClientByUrl(
				activeHostUrl,
			).terminalAgents.outdatedSessions.query();
		},
	});

	const { mutate: restartSessions } = useMutation({
		mutationFn: () => {
			if (!activeHostUrl) throw new Error("No host connection.");
			return getHostServiceClientByUrl(
				activeHostUrl,
			).terminalAgents.restartOutdatedSessions.mutate();
		},
		onError: (error) => toast.error(errorMessage(error)),
		onSettled: () => void refetch(),
	});

	const idleTerminalIds = (outdatedSessions ?? [])
		.filter((session) => session.isIdle)
		.map((session) => session.terminalId)
		.sort()
		.join(",");

	useEffect(() => {
		if (!idleTerminalIds) {
			toast.dismiss(TOAST_ID);
			return;
		}
		const terminalIds = idleTerminalIds.split(",");
		const offered = offeredTerminalIdsRef.current;
		if (terminalIds.every((terminalId) => offered.has(terminalId))) return;

		const markOffered = () => {
			for (const terminalId of terminalIds) offered.add(terminalId);
		};
		toast(t({ message: "Claude Code was updated" }), {
			id: TOAST_ID,
			duration: Number.POSITIVE_INFINITY,
			description: t({
				message: plural(terminalIds.length, {
					one: "# agent still runs the old version.",
					other: "# agents still run the old version.",
				}),
			}),
			action: {
				label: t({ message: "Restart and resume" }),
				onClick: () => {
					markOffered();
					restartSessions(undefined, {
						onError: () => {
							for (const terminalId of terminalIds) offered.delete(terminalId);
						},
					});
				},
			},
			onDismiss: markOffered,
		});
	}, [idleTerminalIds, restartSessions, t]);

	return null;
}
