import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import type { PortForward } from "shared/types";
import type { DashboardSidebarPort } from "../../hooks/useDashboardSidebarPortsData";

/**
 * The address column of a port row. Local ports read as before; remote ports
 * say whether, and where, they reach the local machine.
 */
export function formatPortRowLabel({
	port,
	forward,
}: {
	port: Pick<DashboardSidebarPort, "port" | "hostType">;
	forward: Pick<PortForward, "status"> | null;
}): { text: string; title?: string } {
	if (port.hostType === "local-device") {
		return { text: `localhost:${port.port}` };
	}
	if (!forward) {
		const where =
			port.hostType === "cloud"
				? i18n._(msg({ message: "cloud", context: "port location" }))
				: i18n._(msg({ message: "remote", context: "port location" }));
		return { text: `${port.port} · ${where}` };
	}
	switch (forward.status.state) {
		case "active":
			return forward.status.localPort === port.port
				? { text: `${port.port} · forwarded` }
				: { text: `${port.port} → localhost:${forward.status.localPort}` };
		case "busy":
			return { text: `${port.port} · local port busy` };
		case "error":
			return {
				text: `${port.port} · ${forward.status.message}`,
				title: forward.status.message,
			};
	}
}
