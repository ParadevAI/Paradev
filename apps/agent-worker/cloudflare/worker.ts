import { Container, getContainer } from "@cloudflare/containers";

interface Env {
	AGENT_WORKER: DurableObjectNamespace<AgentWorker>;
	AGENT_API_URL: string;
	AGENT_ROUTER_URL: string;
	AGENT_MODEL?: string;
	AGENT_MAIN_MODEL?: string;
	AGENT_WORKER_SECRET: string;
	TEMPORAL_ADDRESS: string;
	TEMPORAL_NAMESPACE?: string;
	TEMPORAL_API_KEY: string;
	AGENT_ROUTER_API_KEY?: string;
}

const INSTANCES = ["agent-worker-0"];

/** The Temporal worker: one long-running process, kept up by the cron below. */
export class AgentWorker extends Container<Env> {
	defaultPort = 8080;
	sleepAfter = "1h";
	enableInternet = true;

	constructor(...args: ConstructorParameters<typeof Container<Env>>) {
		super(...args);
		const env = args[1];
		const vars: Record<string, string | undefined> = {
			AGENT_API_URL: env.AGENT_API_URL,
			AGENT_ROUTER_URL: env.AGENT_ROUTER_URL,
			AGENT_MODEL: env.AGENT_MODEL,
			AGENT_MAIN_MODEL: env.AGENT_MAIN_MODEL,
			AGENT_WORKER_SECRET: env.AGENT_WORKER_SECRET,
			TEMPORAL_ADDRESS: env.TEMPORAL_ADDRESS,
			TEMPORAL_NAMESPACE: env.TEMPORAL_NAMESPACE,
			TEMPORAL_API_KEY: env.TEMPORAL_API_KEY,
			AGENT_ROUTER_API_KEY: env.AGENT_ROUTER_API_KEY,
		};
		this.envVars = Object.fromEntries(
			Object.entries(vars).filter((entry): entry is [string, string] =>
				Boolean(entry[1]),
			),
		);
	}

	override async onActivityExpired(): Promise<void> {
		this.renewActivityTimeout();
	}
}

export default {
	async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
		await Promise.all(
			INSTANCES.map((name) =>
				getContainer(env.AGENT_WORKER, name).startAndWaitForPorts(),
			),
		);
	},
	async fetch(): Promise<Response> {
		return new Response("Not found", { status: 404 });
	},
};
