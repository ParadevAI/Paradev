import { PortManager, WorkspacePortScanner } from "@superset/port-scanner";
import { treeKillWithEscalation } from "./tree-kill.ts";

export const portManager = new PortManager({
	killFn: treeKillWithEscalation,
});

export const workspacePortScanner = new WorkspacePortScanner();

export const chatPortTerminalIds = new Set<string>();
