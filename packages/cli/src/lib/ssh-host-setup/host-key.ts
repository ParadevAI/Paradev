import { CLIError } from "@superset/cli-framework";
import { hostIdFromMachineId } from "@superset/shared/host-info";
import type { ApiClient } from "../api-client";
import { DEFAULT_API_URL } from "../env";
import { shellQuote } from "../shell-quote";
import type { RemoteFacts } from "./probe";
import type { SshSession } from "./ssh-session";

export async function revokeKeysNamed(
	api: ApiClient,
	name: string,
): Promise<number> {
	const keys = await api.apiKey.list.query();
	const matching = keys.filter((key) => key.name === name);
	for (const key of matching) await api.apiKey.revoke.mutate({ id: key.id });
	return matching.length;
}

export function hostKeyName(hostname: string, hostId: string): string {
	const shortName = hostname.split(".")[0] || hostname;
	// better-auth rejects API key names longer than 32 characters.
	return `Host ${hostId.slice(0, 8)} ${shortName}`.slice(0, 32);
}

// Better Auth uses the authenticated API key ID as the session ID. Read it
// on the host because the get-session response also contains the key itself.
const READ_REMOTE_KEY_ID = `
const { readFileSync } = require("node:fs");
const { homedir } = require("node:os");
const { join } = require("node:path");

async function run() {
	const env = process.env;
	const home = (env.SUPERSET_HOME_DIR || env.PARADEV_HOME_DIR)?.trim() || join(homedir(), ".paradev");
	let config;
	try {
		config = JSON.parse(readFileSync(join(home, "config.json"), "utf8"));
	} catch (error) {
		if (error.code === "ENOENT") return;
		throw error;
	}
	const key = config.apiKey?.trim();
	if (!key) return;
	const api = env.SUPERSET_API_URL || env.PARADEV_API_URL || ${JSON.stringify(DEFAULT_API_URL)};
	const sessionUrl = new URL("/api/auth/get-session", api);
	const response = await fetch(sessionUrl, {
		headers: { "x-api-key": key },
		redirect: "error",
		signal: AbortSignal.timeout(10000),
	});
	if (response.status === 401 || response.status === 403) return;
	if (!response.ok) throw new Error();
	const id = (await response.json())?.session?.id;
	if (typeof id === "string") process.stdout.write(id);
}
run().catch(() => { process.exitCode = 1; });
`;

export async function findRemoteHostKey(
	api: ApiClient,
	ssh: Pick<SshSession, "run" | "target">,
	facts: Pick<RemoteFacts, "bin" | "hostname" | "hostId" | "machineId">,
): Promise<string | undefined> {
	if (!facts.bin) return;
	const names = new Set([
		hostKeyName(facts.hostname, facts.hostId),
		hostKeyName(facts.hostname, hostIdFromMachineId(facts.machineId)),
	]);
	const keys = (await api.apiKey.list.query()).filter(
		(key) => key.name && names.has(key.name),
	);
	if (keys.length === 0) return;
	const result = await ssh.run(
		`
node="$(dirname ${shellQuote(facts.bin)})/../lib/node"
if [ ! -x "$node" ]; then node=node; fi
exec "$node" --input-type=commonjs -`,
		READ_REMOTE_KEY_ID,
	);
	if (result.exitCode !== 0) {
		throw new CLIError(`Could not verify the stored API key on ${ssh.target}`);
	}
	return keys.find((key) => key.id === result.stdout.trim())?.id;
}
