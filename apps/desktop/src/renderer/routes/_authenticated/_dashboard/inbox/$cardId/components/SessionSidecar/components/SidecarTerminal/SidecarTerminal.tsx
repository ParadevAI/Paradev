import { useEffect, useRef } from "react";
import { useTerminalAppearance } from "renderer/hooks/useTerminalAppearance";
import { terminalQueryColors } from "renderer/lib/terminal/terminal-query-colors";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { useWorkspaceWsUrl } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceTrpcProvider/WorkspaceTrpcProvider";
import { useTheme } from "renderer/stores/theme";
import { resolveTerminalThemeType } from "renderer/stores/theme/utils";

interface SidecarTerminalProps {
	workspaceId: string;
	terminalId: string;
	/** Distinct from the workspace pane's instance so both views can show the same PTY. */
	instanceId: string;
	onStatusChange: (status: SidecarStatus) => void;
}

export type SidecarStatus = "connecting" | "open" | "closed" | "ended";

/**
 * A second view onto the session's PTY. It only ever attaches to a terminal
 * the workspace already owns: no `create`, and it detaches rather than
 * disposes on unmount, so closing the sidecar never ends the agent's session.
 */
export function SidecarTerminal({
	workspaceId,
	terminalId,
	instanceId,
	onStatusChange,
}: SidecarTerminalProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const appearance = useTerminalAppearance();
	const appearanceRef = useRef(appearance);
	appearanceRef.current = appearance;
	const activeTheme = useTheme();
	const themeType = resolveTerminalThemeType({
		activeThemeType: activeTheme?.type,
	});
	const baseWebsocketUrl = useWorkspaceWsUrl(`/terminal/${terminalId}`);
	const url = new URL(baseWebsocketUrl);
	url.searchParams.set("workspaceId", workspaceId);
	url.searchParams.set("themeType", themeType);
	url.searchParams.set(
		"colors",
		JSON.stringify(terminalQueryColors(appearance.theme)),
	);
	const websocketUrlRef = useRef(url.toString());
	websocketUrlRef.current = url.toString();

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		terminalRuntimeRegistry.mount(
			terminalId,
			container,
			appearanceRef.current,
			instanceId,
		);
		terminalRuntimeRegistry.connect(
			terminalId,
			websocketUrlRef.current,
			instanceId,
		);
		const report = () => {
			if (terminalRuntimeRegistry.isSessionEnded(terminalId, instanceId)) {
				onStatusChange("ended");
				return;
			}
			const state = terminalRuntimeRegistry.getConnectionState(
				terminalId,
				instanceId,
			);
			onStatusChange(
				state === "open"
					? "open"
					: state === "connecting"
						? "connecting"
						: "closed",
			);
		};
		report();
		const stop = terminalRuntimeRegistry.onStateChange(
			terminalId,
			report,
			instanceId,
		);
		return () => {
			stop();
			terminalRuntimeRegistry.detach(terminalId, instanceId);
		};
	}, [terminalId, instanceId, onStatusChange]);

	useEffect(() => {
		terminalRuntimeRegistry.updateAppearance(
			terminalId,
			appearance,
			instanceId,
		);
	}, [terminalId, instanceId, appearance]);

	return (
		<div className="relative min-h-0 flex-1">
			<div ref={containerRef} className="absolute inset-0 px-2 py-1" />
		</div>
	);
}
