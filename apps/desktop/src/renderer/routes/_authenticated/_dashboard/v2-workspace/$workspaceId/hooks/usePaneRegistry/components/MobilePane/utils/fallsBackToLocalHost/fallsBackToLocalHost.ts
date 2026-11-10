import type { AppRouter } from "@superset/host-service";
import type { inferRouterOutputs } from "@trpc/server";
import type { WorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";

type MobileBackend =
	inferRouterOutputs<AppRouter>["mobile"]["status"]["backend"];

interface WorkspaceHostAnswer {
	workspaceHost: WorkspaceHostTarget;
	/** Undefined until the workspace's host answers. */
	backend: MobileBackend | undefined;
}

/** A workspace on another machine that has no simulator (a Linux host) gets
 * the simulators of the machine the app runs on. A cloud sandbox keeps its
 * own answer: its simulator is a hosted one. */
export function fallsBackToLocalHost({
	workspaceHost,
	backend,
}: WorkspaceHostAnswer): boolean {
	return (
		workspaceHost.status === "ready" &&
		workspaceHost.kind === "remote" &&
		backend === "none"
	);
}
