#!/usr/bin/env node
import { createTokenVerifier, importPublicKey } from "./auth/auth.ts";
import { createBackgroundHost } from "./background/background.ts";
import { Hub } from "./hub/hub.ts";
import { addReplyNote, migrateOwnerNotes } from "./memory/memory.ts";
import { createSessionModel } from "./model/model.ts";
import {
	AUTO,
	routerTiersFromEnv,
	unknownModels,
} from "./model-router/model-router.ts";
import { identityFromEnv } from "./orientation/orientation.ts";
import { openPiSession } from "./pi/pi-session.ts";
import { clearOldPublicSessions } from "./public-sessions/public-sessions.ts";
import { DEFAULT_ROLLOVER } from "./rollover/rollover.ts";
import { startRunnerServer } from "./server/server.ts";
import { noticesOverHttp, settleOverHttp } from "./turn-http/turn-http.ts";

function required(name: string): string {
	const value = process.env[name];
	if (!value) {
		console.error(`dev-runner: ${name} is not set`);
		process.exit(1);
	}
	return value;
}

const boxId = required("DEV_BOX_ID");
const apiUrl = required("DEV_API_URL");
const publicKey = await importPublicKey(required("DEV_BOX_PUBLIC_KEY"));
const agentDir = process.env.DEV_AGENT_DIR ?? "/agent";
const port = Number(process.env.PORT ?? 7700);
migrateOwnerNotes(agentDir);
addReplyNote(agentDir);
// Public page conversations are ephemeral: what this box kept of them goes two days on.
clearOldPublicSessions(agentDir);

const modelId = process.env.DEV_MODEL;
const faux = process.env.DEV_FAUX_MODEL === "1";
const tiers = routerTiersFromEnv(process.env);
if (modelId === AUTO && !faux) {
	// Every tier's ids are checked against the gateway catalog now, so a typo stops the box instead of failing a turn.
	const { runtime } = await createSessionModel({ apiUrl });
	const unknown = unknownModels(
		tiers,
		(id) => runtime.getModel("vercel-ai-gateway", id) !== undefined,
	);
	if (unknown.length > 0) {
		console.error(
			`dev-runner: unknown gateway models in DEV_MODELS_*: ${unknown.join(", ")}`,
		);
		process.exit(1);
	}
}
const identity = identityFromEnv(process.env);
// Test-only: the e2e lowers the rollover size to watch a session roll over in a few turns.
const rolloverTokens = Number(process.env.DEV_ROLLOVER_TOKENS);
const rollover =
	rolloverTokens > 0
		? { ...DEFAULT_ROLLOVER, tokens: rolloverTokens }
		: DEFAULT_ROLLOVER;
// Custom MCP servers' header values reach the box as env at wake; a command could print them, so traces never keep them.
const secrets = Object.entries(process.env).flatMap(([name, value]) =>
	name.startsWith("MCP_") && value && value.length >= 6 ? [value] : [],
);
// Background work (agents, commands) is the box's, across its chats, as Claude Code's tasks are its process's: a notice
// of work that ended goes into the chat's running turn, else to the API as a turn of its own.
// The API accepts this box's credential only once it has recorded the box, after the wake; its first turn shows it
// has. Notices wait for that, so what a box that went away left unfinished (reported as this one starts) isn't refused.
const notice = noticesOverHttp(apiUrl);
let registered!: () => void;
const firstTurn = new Promise<void>((resolve) => (registered = resolve));
let hub: Hub | undefined;
const background = createBackgroundHost({
	agentDir,
	deliver: async (chatId, text) => (
		await firstTurn, hub ? hub.notify(chatId, text) : notice(chatId, text)
	),
});
hub = new Hub(
	(sessionId) =>
		openPiSession({
			agentDir,
			sessionId,
			apiUrl,
			modelId,
			tiers,
			faux,
			identity,
			rollover,
			background,
		}),
	secrets,
	notice,
);

await startRunnerServer({
	port,
	hub,
	verify: createTokenVerifier({ publicKey, boxId }),
	settle: settleOverHttp(apiUrl),
	busy: () => background.busy(),
	onTurn: registered,
});
console.log(`dev-runner: box ${boxId} serving ACP on :${port}/acp`);
