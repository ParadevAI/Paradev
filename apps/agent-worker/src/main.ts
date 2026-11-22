import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { AGENT_TASK_QUEUE } from "@superset/agent-harness/session";
import { turnSteersQuery } from "@superset/agent-harness/session/definitions";
import {
	Client,
	Connection,
	ScheduleAlreadyRunning,
	ScheduleOverlapPolicy,
} from "@temporalio/client";
import { NativeConnection, Worker } from "@temporalio/worker";
import { createActivities } from "./activities/createActivities";
import { workerApi } from "./clients/workerApi";

const need = (name: string) => {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set`);
	return value;
};

const MIN_PDEV = [0, 2, 3];
const pdevBin = process.env.PDEV_BIN ?? "pdev";
const pdevVersion = (
	await promisify(execFile)(pdevBin, ["--version"])
).stdout.trim();
// Older pdev ignores PDEV_REMOTE_* and would run the agent's commands on this machine.
if (compareVersions(pdevVersion, MIN_PDEV) < 0) {
	throw new Error(
		`pdev ${pdevVersion} has no cloud mode; need ${MIN_PDEV.join(".")} or newer`,
	);
}

const api = workerApi({
	apiUrl: need("AGENT_API_URL"),
	workerSecret: need("AGENT_WORKER_SECRET"),
	model: {
		baseUrl: process.env.AGENT_ROUTER_URL ?? "https://router.superset.sh",
		modelId: process.env.AGENT_MODEL ?? "",
	},
	...(process.env.AGENT_ROUTER_API_KEY
		? { modelHeaders: { "x-api-key": process.env.AGENT_ROUTER_API_KEY } }
		: {}),
	local: localFallback(process.env),
});

const apiKey = process.env.TEMPORAL_API_KEY;
const namespace = process.env.TEMPORAL_NAMESPACE || "default";
const temporal = {
	address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
	...(apiKey ? { tls: true, apiKey } : {}),
};
const connection = await NativeConnection.connect(temporal);
const client = new Client({
	connection: await Connection.connect(temporal),
	namespace,
});

const worker = await Worker.create({
	connection,
	namespace,
	taskQueue: AGENT_TASK_QUEUE,
	defaultHeartbeatThrottleInterval: "2 seconds",
	maxHeartbeatThrottleInterval: "2 seconds",
	...workflowSource(),
	activities: createActivities({
		credentials: api.credentials,
		settler: api.settler,
		roomPoster: api.roomPoster,
		reconcile: api.reconcile,
		pdev: {
			command: pdevBin,
			workRoot: process.env.AGENT_WORK_ROOT ?? join(tmpdir(), "agent-sessions"),
			...(process.env.AGENT_MODEL ? { model: process.env.AGENT_MODEL } : {}),
			...(process.env.AGENT_MAIN_MODEL
				? { mainModel: process.env.AGENT_MAIN_MODEL }
				: {}),
		},
		turnSteers: (workflowId, turnId) =>
			client.workflow.getHandle(workflowId).query(turnSteersQuery, turnId),
	}),
	// The container host waits 15 minutes after SIGTERM; a turn still running after this resumes elsewhere.
	shutdownGraceTime: "5 minutes",
});

await ensureReconcileSchedule(client);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.once(signal, () => worker.shutdown());
}
if (process.env.PORT) {
	createServer((_request, response) => {
		const up = worker.getState() === "RUNNING";
		response.writeHead(up ? 200 : 503).end(worker.getState());
	}).listen(Number(process.env.PORT));
}
await worker.run();
await connection.close();
process.exit(0);

/** A built image ships the workflows already bundled; a checkout bundles them at start. */
function workflowSource() {
	const bundle = fileURLToPath(
		new URL("./workflow-bundle.js", import.meta.url),
	);
	if (existsSync(bundle)) return { workflowBundle: { codePath: bundle } };
	return {
		workflowsPath: fileURLToPath(
			new URL("./workflows/index.ts", import.meta.url),
		),
	};
}

/** Local runs only: a session without a box uses this host, and every session these router headers. */
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
		...(env.AGENT_LOCAL_MODEL_HEADERS
			? {
					modelHeaders: JSON.parse(env.AGENT_LOCAL_MODEL_HEADERS) as Record<
						string,
						string
					>,
				}
			: {}),
	};
}

function compareVersions(version: string, min: number[]): number {
	const parts = version
		.split(".")
		.map((part) => Number.parseInt(part, 10) || 0);
	for (let i = 0; i < min.length; i++) {
		const diff = (parts[i] ?? 0) - (min[i] ?? 0);
		if (diff !== 0) return diff;
	}
	return 0;
}

/** Every worker makes sure the schedule exists; the first one creates it. */
async function ensureReconcileSchedule(client: Client) {
	await client.schedule
		.create({
			scheduleId: "devs-reconcile",
			spec: { intervals: [{ every: "1 minute" }] },
			action: {
				type: "startWorkflow",
				workflowType: "devsReconcile",
				taskQueue: AGENT_TASK_QUEUE,
				args: [],
			},
			policies: { overlap: ScheduleOverlapPolicy.SKIP },
		})
		.catch((error: unknown) => {
			if (!(error instanceof ScheduleAlreadyRunning)) throw error;
		});
}
