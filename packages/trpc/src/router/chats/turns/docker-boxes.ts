import { spawn } from "node:child_process";
import { BOX_CREDENTIAL_HEADER } from "./box-auth";
import type { Box, BoxProvider } from "./boxes";

/** The runner's port inside the image. */
const RUNNER_PORT = 7700;
/** Where the box's proxy listens, on the loopback the box shares with it. */
const PROXY_PORT = 7701;
const BOX_ID_LABEL = "paradev.box-id";
const WAKE_TIMEOUT_MS = 30_000;
const POLL_MS = 100;

const volume = (agentId: string) => `paradev-dev-agent-${agentId}`;
const container = (agentId: string) => `paradev-dev-box-${agentId}`;
const proxyContainer = (agentId: string) => `paradev-dev-proxy-${agentId}`;

/**
 * The box's proxy, as a sandbox's network proxy is in a deployment: forwards
 * the box's requests to the API with the box's credential added, streaming
 * both ways.
 */
const PROXY_SCRIPT = `
const http = require("node:http"), https = require("node:https");
const upstream = new URL(process.env.DEV_UPSTREAM);
const base = upstream.pathname.replace(/\\/$/, "");
http.createServer((req, res) => {
  const headers = { ...req.headers, host: upstream.host, "${BOX_CREDENTIAL_HEADER}": process.env.DEV_BOX_CREDENTIAL };
  const out = (upstream.protocol === "https:" ? https : http).request(upstream.origin + base + req.url, { method: req.method, headers }, (answer) => {
    res.writeHead(answer.statusCode, answer.headers);
    answer.pipe(res);
  });
  out.on("error", () => res.headersSent ? res.destroy() : res.writeHead(502).end());
  req.pipe(out);
}).listen(${PROXY_PORT}, "127.0.0.1");`;

/** One docker CLI call. Tests stand in for it. */
export type DockerCli = (
	args: string[],
	opts?: { env?: Record<string, string> },
) => Promise<{ ok: boolean; stdout: string; stderr: string }>;

const dockerCli: DockerCli = (args, opts = {}) =>
	new Promise((resolve) => {
		const child = spawn("docker", args, {
			env: { ...process.env, ...opts.env },
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("error", (error) =>
			resolve({ ok: false, stdout: "", stderr: error.message }),
		);
		child.on("close", (code) =>
			resolve({ ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim() }),
		);
	});

/** `-e NAME` without a value makes docker read it from its own env, so secrets never appear in argv. */
const envFlags = (env: Record<string, string>) =>
	Object.keys(env).flatMap((name) => ["-e", name]);

/**
 * Local boxes: one container per Dev from the box image, with a named volume
 * at `/agent`. Each box shares the network of a small proxy container that
 * holds the box's credential and forwards to the API, so the box reaches the
 * API at its own loopback and never sees the credential.
 */
export function dockerBoxes(opts: {
	image: string;
	/** The API's routes for boxes, as a container reaches them. */
	upstreamUrl: string;
	docker?: DockerCli;
	healthy?: (url: string) => Promise<boolean>;
}): BoxProvider & { boxApiUrl: string } {
	const docker = opts.docker ?? dockerCli;
	const healthy =
		opts.healthy ??
		((url) =>
			fetch(`${url}/health`).then(
				(response) => response.ok,
				() => false,
			));

	async function must(args: string[], env?: Record<string, string>) {
		const result = await docker(args, { env });
		if (!result.ok)
			throw new Error(`docker ${args[0]} failed: ${result.stderr}`);
		return result.stdout;
	}

	async function status(agentId: string): Promise<Box | null> {
		const inspect = await docker([
			"inspect",
			"--format",
			`{{.State.Running}} {{index .Config.Labels "${BOX_ID_LABEL}"}}`,
			container(agentId),
		]);
		const [running, boxId] = inspect.stdout.split(" ");
		if (!inspect.ok || running !== "true" || !boxId) return null;
		const port = await docker([
			"port",
			proxyContainer(agentId),
			`${RUNNER_PORT}/tcp`,
		]);
		const hostPort = port.stdout.split("\n")[0]?.split(":").at(-1);
		return port.ok && hostPort
			? { id: boxId, url: `http://127.0.0.1:${hostPort}` }
			: null;
	}

	async function stop(agentId: string) {
		await docker(["rm", "-f", container(agentId), proxyContainer(agentId)]);
	}

	return {
		boxApiUrl: `http://127.0.0.1:${PROXY_PORT}`,
		status,
		stop,
		async wake(agentId, { boxId, credential, env }) {
			const running = await status(agentId);
			if (running) return running;
			await stop(agentId);
			const proxyEnv = {
				DEV_UPSTREAM: opts.upstreamUrl,
				DEV_BOX_CREDENTIAL: credential,
			};
			await must(
				[
					"run",
					"-d",
					"--name",
					proxyContainer(agentId),
					"-p",
					`127.0.0.1::${RUNNER_PORT}`,
					"--add-host",
					"host.docker.internal:host-gateway",
					...envFlags(proxyEnv),
					"--entrypoint",
					"node",
					opts.image,
					"-e",
					PROXY_SCRIPT,
				],
				proxyEnv,
			);
			const boxEnv = { ...env, DEV_BOX_ID: boxId };
			await must(
				[
					"run",
					"-d",
					"--name",
					container(agentId),
					"--label",
					`${BOX_ID_LABEL}=${boxId}`,
					"-v",
					`${volume(agentId)}:/agent`,
					"--network",
					`container:${proxyContainer(agentId)}`,
					...envFlags(boxEnv),
					opts.image,
				],
				boxEnv,
			);
			const deadline = Date.now() + WAKE_TIMEOUT_MS;
			while (Date.now() < deadline) {
				const box = await status(agentId);
				if (box && (await healthy(box.url))) return box;
				await new Promise((resolve) => setTimeout(resolve, POLL_MS));
			}
			const logs = await docker(["logs", "--tail", "20", container(agentId)]);
			throw new Error(
				`the box did not become healthy: ${logs.stdout} ${logs.stderr}`,
			);
		},
	};
}
