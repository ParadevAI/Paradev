import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { DashboardSidebarPort } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarPortsData";
import type { PortForward } from "shared/types";

interface CloudPortForwardActionsProps {
	port: Pick<DashboardSidebarPort, "port" | "hostUrl" | "workspaceId">;
	forward: PortForward | null;
}

const BUTTON_CLASS =
	"shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-fill-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60";

export function CloudPortForwardActions({
	port,
	forward,
}: CloudPortForwardActionsProps) {
	const { t } = useLingui();
	const organizationId = useActiveOrganizationId();
	const portNumber = port.port;
	const start = electronTrpc.portForwards.forward.useMutation({
		onError: (error) => {
			toast.error(t({ message: `Couldn't forward port ${portNumber}` }), {
				description: errorMessage(error),
			});
		},
	});
	const stop = electronTrpc.portForwards.stopForward.useMutation({
		onError: (error) => {
			toast.error(
				t({ message: `Couldn't stop forwarding port ${portNumber}` }),
				{ description: errorMessage(error) },
			);
		},
	});
	const pending = start.isPending || stop.isPending;

	if (forward && !forward.explicit) return null;
	return forward ? (
		<button
			type="button"
			disabled={pending}
			onClick={(e) => {
				e.stopPropagation();
				stop.mutate({ id: forward.id });
			}}
			className={BUTTON_CLASS}
		>
			<Trans>Stop</Trans>
		</button>
	) : (
		<button
			type="button"
			disabled={pending}
			onClick={(e) => {
				e.stopPropagation();
				start.mutate({
					hostUrl: port.hostUrl,
					workspaceId: port.workspaceId,
					remotePort: port.port,
					organizationId: organizationId ?? undefined,
					viaGate: true,
				});
			}}
			className={BUTTON_CLASS}
		>
			<Trans context="port forwarding">Forward</Trans>
		</button>
	);
}
