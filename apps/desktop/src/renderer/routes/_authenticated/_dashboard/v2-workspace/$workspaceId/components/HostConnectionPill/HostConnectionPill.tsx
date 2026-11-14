import { useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { useWorkspaceHostUrl } from "@superset/workspace-client";
import { Link } from "@tanstack/react-router";
import { useKnownHosts } from "renderer/hooks/known-hosts/useKnownHosts";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useSandboxAccess } from "renderer/routes/_authenticated/providers/SandboxAccessProvider";
import { useHostReachability } from "../../../hooks/useHostReachability";
import { useWorkspace } from "../../../providers/WorkspaceProvider";
import { LOCAL_HOST_SERVICE_DETAIL } from "../../../providers/WorkspaceProvider/utils/localHostServiceDetail";
import { useCountdown } from "../../hooks/useCountdown";
import { useChatSessionChecksFailing } from "../../hooks/usePaneRegistry/components/ChatPane/components/AcpChatPane/hooks/useChatSessionLiveness";
import { ConnectionPill, WAKE_UP_ESTIMATE_SECONDS } from "../ConnectionPill";

/** The open workspace's host connection, shown only while it is not answering. */
export function HostConnectionPill() {
	const { t } = useLingui();
	const { workspace } = useWorkspace();
	const hostUrl = useWorkspaceHostUrl();
	const { machineId, hostServiceStatus } = useLocalHostService();
	const {
		isDegraded,
		isAccessDenied,
		isReconnecting,
		hasConnected,
		detail: reachabilityDetail,
		retry: onRetry,
	} = useHostReachability(hostUrl);
	const { failing: checksFailing, retry: retryChecks } =
		useChatSessionChecksFailing(hostUrl);
	const { hosts: hostRows } = useKnownHosts();
	const {
		targets: sandboxes,
		usageRefusal,
		wakeOpenWorkspace,
	} = useSandboxAccess();
	const isSandbox = sandboxes.some(
		(sandbox) => sandbox.workspaceId === workspace.hostId,
	);
	const isLocalRestartInFlight =
		workspace.hostId === machineId && hostServiceStatus === "starting";
	const isCheckFailing =
		checksFailing && !isDegraded && !isAccessDenied && !isLocalRestartInFlight;
	const isWakingUp = isSandbox && isReconnecting && !isAccessDenied;
	const settingsHostId = isSandbox ? null : workspace.hostId;
	const hostRow = hostRows.find(
		(host) =>
			host.organizationId === workspace.organizationId &&
			host.machineId === workspace.hostId,
	);
	const hostName = isSandbox
		? t({ message: "Cloud workspace" })
		: (hostRow?.name ??
			(workspace.hostId === machineId
				? t({ message: "This device" })
				: t({ message: "Unknown host" })));
	const detail = isLocalRestartInFlight
		? i18n._(LOCAL_HOST_SERVICE_DETAIL.starting)
		: isSandbox && !isAccessDenied
			? isReconnecting
				? t({
						message:
							"This cloud workspace is waking up, which can take up to 30 seconds after it has been idle.",
					})
				: t({
						message:
							"Couldn't reach this cloud workspace. It may still be waking up. Try again.",
					})
			: isCheckFailing
				? workspace.hostId === machineId
					? t({
							message:
								"Try again, or restart the host service from the Paradev tray menu.",
						})
					: t({
							message: "Please try again, or restart Paradev on that device.",
						})
				: reachabilityDetail;
	const isDialing =
		!isAccessDenied &&
		(isReconnecting || isLocalRestartInFlight || isCheckFailing);
	const secondsLeft = useCountdown(
		isWakingUp && isDegraded ? WAKE_UP_ESTIMATE_SECONDS : 0,
	);
	const label = isCheckFailing
		? t({ message: "Can't reach the host" })
		: isAccessDenied
			? t({ message: "Access denied" })
			: isLocalRestartInFlight
				? t({ message: "Restarting…" })
				: !isReconnecting
					? t({ message: "Disconnected" })
					: isWakingUp
						? secondsLeft > 0
							? t({ message: "Waking up workspace" })
							: t({ message: "Still waking up…" })
						: hasConnected
							? t({ message: "Reconnecting…" })
							: t({ message: "Connecting…" });

	if (usageRefusal?.workspaceId === workspace.hostId) return null;
	if (!isDegraded && !isAccessDenied && !isCheckFailing) return null;

	return (
		<ConnectionPill
			label={label}
			detail={detail}
			title={hostName}
			dialing={isDialing}
			denied={isAccessDenied}
			trailing={
				isWakingUp && secondsLeft > 0
					? t({ message: `~${secondsLeft}s` })
					: null
			}
			actions={
				settingsHostId ? (
					<Link
						to="/settings/hosts/$hostId"
						params={{ hostId: settingsHostId }}
						className="shrink-0 rounded-full px-2.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
					>
						{t({ message: "Host settings" })}
					</Link>
				) : null
			}
			onRetry={
				isCheckFailing
					? retryChecks
					: isSandbox
						? () => {
								onRetry();
								void wakeOpenWorkspace().then(onRetry, () => {});
							}
						: onRetry
			}
		/>
	);
}
