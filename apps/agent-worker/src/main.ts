import { fileURLToPath } from "node:url";
import { streamSimple } from "@earendil-works/pi-ai/compat";
import { AGENT_TASK_QUEUE } from "@superset/agent-harness/session";
import { NativeConnection, Worker } from "@temporalio/worker";
import { createActivities } from "./activities/createActivities";
import { workerApi } from "./clients/workerApi";

const need = (name: string) => {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set`);
	return value;
};

const api = workerApi({
	apiUrl: need("AGENT_API_URL"),
	workerSecret: need("AGENT_WORKER_SECRET"),
	model: {
		baseUrl: process.env.AGENT_ROUTER_URL ?? "https://router.superset.sh",
		modelId: process.env.AGENT_MODEL ?? "claude-sonnet-5",
	},
	...(process.env.AGENT_ROUTER_API_KEY
		? { modelHeaders: { "x-api-key": process.env.AGENT_ROUTER_API_KEY } }
		: {}),
	local: localFallback(process.env),
});

const apiKey = process.env.TEMPORAL_API_KEY;
const connection = await NativeConnection.connect({
	address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
	...(apiKey ? { tls: true, apiKey } : {}),
});

const worker = await Worker.create({
	connection,
	namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
	taskQueue: AGENT_TASK_QUEUE,
	defaultHeartbeatThrottleInterval: "2 seconds",
	maxHeartbeatThrottleInterval: "2 seconds",
	workflowsPath: fileURLToPath(
		new URL("./workflows/index.ts", import.meta.url),
	),
	activities: createActivities({
		credentials: api.credentials,
		settler: api.settler,
		roomPoster: api.roomPoster,
		stream: streamSimple,
	}),
	shutdownGraceTime: "60 seconds",
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.once(signal, () => worker.shutdown());
}
await worker.run();
await connection.close();

/** Local runs only: a session without a box uses this host, and every session uses this model key. */
function localFallback(env: NodeJS.ProcessEnv) {
	return {
		...(env.AGENT_LOCAL_HOST_URL &&
		env.AGENT_LOCAL_HOST_BEARER &&
		env.AGENT_LOCAL_WORKSPACE_ID
			? {
					host: {
						url: env.AGENT_LOCAL_HOST_URL,
						bearer: env.AGENT_LOCAL_HOST_BEARER,
						workspaceId: env.AGENT_LOCAL_WORKSPACE_ID,
					},
				}
			: {}),
		...(env.AGENT_LOCAL_ROUTER_API_KEY
			? { modelHeaders: { "x-api-key": env.AGENT_LOCAL_ROUTER_API_KEY } }
			: {}),
	};
}
