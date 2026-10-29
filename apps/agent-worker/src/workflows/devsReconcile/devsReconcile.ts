import { proxyActivities } from "@temporalio/workflow";
import type { AgentActivities } from "../../activities/createActivities";

const { reconcileDevs } = proxyActivities<AgentActivities>({
	startToCloseTimeout: "2 minutes",
	retry: { maximumAttempts: 1 },
});

/** One pass of the Dev reconciler; the `devs-reconcile` schedule starts it every minute. */
export async function devsReconcile(): Promise<void> {
	await reconcileDevs();
}
