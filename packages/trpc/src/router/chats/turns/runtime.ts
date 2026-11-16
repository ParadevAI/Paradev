import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "../../../env";
import { CHATS_BOX_API_PATH } from "./box-path";
import { type BoxKeys, generateBoxKeys, loadBoxKeys } from "./box-tokens";
import { dockerBoxes } from "./docker-boxes";
import { postDevMessage, settleTurn, type TurnDeps } from "./engine";
import { httpRunner } from "./http-runner";
import { inlineTurnRuns } from "./inline-runs";
import { memoryBoxes, scriptedRunner } from "./scripted";

const IDLE_TIMEOUT_MS = 10 * 60_000;
const SCRIPTED_THINK_MS = 1_500;

/**
 * Kept on `globalThis`: a development server reloads this module on every
 * edit, and the runs in flight and the boxes' keys must outlive that.
 */
const held = globalThis as typeof globalThis & {
	__chatsTurns?: { runtime?: TurnDeps | null; keys?: Promise<BoxKeys> };
};
held.__chatsTurns ??= {};
const state = held.__chatsTurns;

const DEV_KEYS_FILE = join(tmpdir(), "paradev-chats-box-keys.json");

/**
 * Development's key pair, kept in a file so boxes woken before a restart of
 * the API still trust it. A deployment loads its pair from its environment.
 */
async function developmentBoxKeys(): Promise<BoxKeys> {
	try {
		const saved = JSON.parse(await readFile(DEV_KEYS_FILE, "utf8")) as {
			privateKey: string;
			publicKey: string;
		};
		return await loadBoxKeys(saved.privateKey, saved.publicKey);
	} catch {
		const made = await generateBoxKeys();
		await writeFile(
			DEV_KEYS_FILE,
			JSON.stringify({
				privateKey: made.privateKeyText,
				publicKey: made.publicKeyText,
			}),
			{ mode: 0o600 },
		);
		return made;
	}
}

function processBoxKeys(): Promise<BoxKeys> {
	state.keys ??= developmentBoxKeys();
	return state.keys;
}

/** Development's runtime: turns run in this process against a scripted model. */
function scriptedRuntime(): TurnDeps {
	const deps: TurnDeps = {
		boxes: memoryBoxes(),
		runner: scriptedRunner(
			{
				reply: (turn, text) => postDevMessage(turn, { text, endsTurn: true }),
				settle: (turn, result) => settleTurn(deps, turn, result),
			},
			{ thinkMs: SCRIPTED_THINK_MS },
		),
		turnRuns: inlineTurnRuns(() => deps),
		boxKeys: processBoxKeys,
		boxApiUrl: "",
		fauxModel: true,
		idleTimeoutMs: IDLE_TIMEOUT_MS,
	};
	return deps;
}

const BOX_IMAGE = "paradev-dev-box:dev";

/**
 * Development with `CHATS_BOX_DRIVER=docker`: each Dev runs in a local
 * container from the box image (`bun run image:build` in
 * packages/chats-runner), with the real runner inside.
 */
function dockerRuntime(): TurnDeps {
	const api = new URL(env.NEXT_PUBLIC_API_URL);
	api.hostname = "host.docker.internal";
	api.pathname = CHATS_BOX_API_PATH;
	const boxes = dockerBoxes({
		image: BOX_IMAGE,
		upstreamUrl: api.toString(),
	});
	const deps: TurnDeps = {
		boxes,
		runner: httpRunner(processBoxKeys),
		turnRuns: inlineTurnRuns(() => deps),
		boxKeys: processBoxKeys,
		boxApiUrl: boxes.boxApiUrl,
		fauxModel: !env.VERCEL_AI_GATEWAY_KEY,
		idleTimeoutMs: IDLE_TIMEOUT_MS,
	};
	return deps;
}

/**
 * What runs Devs' turns here, or null where nothing does yet. Only local
 * development has one: the durable runs and sandboxes a deployment needs are
 * not built, so there a message starts no turn.
 */
export function chatsTurnRuntime(): TurnDeps | null {
	if (state.runtime === undefined) {
		state.runtime =
			env.NODE_ENV !== "development"
				? null
				: process.env.CHATS_BOX_DRIVER === "docker"
					? dockerRuntime()
					: scriptedRuntime();
	}
	return state.runtime;
}

/** Replaces the runtime, for tests. */
export function setChatsTurnRuntime(next: TurnDeps | null) {
	state.runtime = next;
}
