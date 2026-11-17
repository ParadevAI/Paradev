// Superset Prime Agent watcher v2
// Prime Agent's Rust build has no extensions, so this watcher, started by the
// wrapper, polls `prime-agent sessions --json` and reports the lifecycle of
// the session running in the launching terminal's directory.
// Prime Agent sends its launch message again each time the TUI reconnects to
// a restarted session worker, so the wrapper takes the message out of argv
// and this watcher sends it once, with `prime-agent send`, to the new session.
// Usage: node prime-agent-watch.mjs <wrapper pid> <real binary> <cwd> [prompt file]
//        node prime-agent-watch.mjs split <prompt file> <args file> [args...]
import { execFile } from "node:child_process";
import {
	existsSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

// From `prime-agent --help`. An option not listed here stops the split, so a
// flag added later cannot have its value taken for the message.
const VALUE_OPTIONS = new Set([
	"--daemon-socket",
	"--provider",
	"--model",
	"--api-key",
	"--models",
	"--thinking",
	"--session-dir",
	"--goal",
	"--goal-token-budget",
	"--skill",
	"--prompt-template",
	"--theme",
	"--system-prompt",
	"--append-system-prompt",
	"--autonomous-gate",
	"--autonomous-gate-retries",
	"--autonomous-gate-timeout-ms",
	"--autonomous-max-continuations",
	"--autonomous-max-turns",
	"--autonomous-max-tokens",
	"--autonomous-timeout-ms",
]);
const FLAG_OPTIONS = new Set([
	"--offline",
	"--verbose",
	"--no-session",
	"-ns",
	"--no-skills",
	"-np",
	"--no-prompt-templates",
	"--no-themes",
	"-nc",
	"--no-context-files",
	"--autonomous",
]);
// Launches that do not open a new interactive session keep their message.
const KEEP_MESSAGE_OPTIONS = new Set([
	"-p",
	"--print",
	"-c",
	"--continue",
	"-r",
	"--resume",
	"--fork",
	"--mode",
	"--cwd",
]);

/** Returns the args without a single trailing message, or null to keep argv. */
function splitLaunchMessage(args) {
	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		const isLast = i === args.length - 1;
		if (arg === "--") {
			const rest = args.slice(i + 1);
			if (rest.length !== 1 || rest[0].startsWith("@") || !rest[0].trim()) {
				return null;
			}
			return { args: args.slice(0, i), message: rest[0] };
		}
		if (arg.startsWith("-")) {
			const name = arg.split("=", 1)[0];
			if (KEEP_MESSAGE_OPTIONS.has(name)) return null;
			if (VALUE_OPTIONS.has(name)) {
				if (!arg.includes("=")) i += 1;
				continue;
			}
			if (FLAG_OPTIONS.has(name)) continue;
			return null;
		}
		if (!isLast || arg.startsWith("@") || !arg.trim()) return null;
		return { args: args.slice(0, i), message: arg };
	}
	return null;
}

if (process.argv[2] === "split") {
	const [, , , promptFile, argsFile, ...args] = process.argv;
	const split = splitLaunchMessage(args);
	if (split) writeFileSync(promptFile, split.message, { mode: 0o600 });
	const kept = split ? split.args : args;
	writeFileSync(argsFile, kept.map((arg) => `${arg}\0`).join(""), {
		mode: 0o600,
	});
	process.exit(0);
}

const [, self, parentPidArg, realBin, launchCwd, promptFile = ""] =
	process.argv;
const parentPid = Number(parentPidArg);
const homeDir = process.env.SUPERSET_HOME_DIR;
if (!parentPid || !realBin || !launchCwd) process.exit(0);
if (!homeDir && !promptFile) process.exit(0);

const POLL_MS = Number(process.env.SUPERSET_PRIME_WATCH_POLL_MS) || 1000;
const notify = `${homeDir}/hooks/notify.sh`;
const notifyEnv = {
	...process.env,
	SUPERSET_AGENT_ID: "prime-agent",
	SUPERSET_HOOK_HARNESS: "prime-agent",
};

function canonical(dir) {
	try {
		return realpathSync(dir);
	} catch {
		return dir;
	}
}
const cwd = canonical(launchCwd);

let pending = Promise.resolve();
function report(eventType, sessionId) {
	pending = pending.then(
		() =>
			new Promise((resolve) => {
				// Deleting the watcher file disables running copies, as with the extension.
				if (!homeDir || !existsSync(self)) return resolve();
				execFile(
					notify,
					[
						JSON.stringify({
							hook_event_name: eventType,
							session_id: sessionId,
						}),
					],
					{ timeout: 8000, env: notifyEnv },
					() => resolve(),
				);
			}),
	);
	return pending;
}

function listSessions() {
	return new Promise((resolve) => {
		execFile(realBin, ["sessions", "--json"], { timeout: 5000 }, (err, out) => {
			if (err) return resolve(null);
			try {
				resolve(JSON.parse(out).sessions ?? []);
			} catch {
				resolve(null);
			}
		});
	});
}

const isWorking = (s) => s.activity === "working" || s.isStreaming === true;
const key = (s) => s.sessionId ?? s.id;

const startedAt = Date.now();
const PROMPT_CLOCK_SLACK_MS = 5000;
const PROMPT_TIMEOUT_MS =
	Number(process.env.SUPERSET_PRIME_PROMPT_TIMEOUT_MS) || 120_000;
const MAX_SEND_ATTEMPTS = 5;
let promptPending = promptFile !== "";
let sendAttempts = 0;

function sendMessage(agentId, message) {
	return new Promise((resolve) => {
		execFile(realBin, ["send", agentId, message], { timeout: 15_000 }, (err) =>
			resolve(!err),
		);
	});
}

// The TUI lists its session as an empty draft as soon as it opens. A file the
// wrapper still holds after a give-up is reported to the user on exit.
async function deliverPrompt(here) {
	if (!promptPending) return;
	if (!existsSync(promptFile)) {
		promptPending = false;
		return;
	}
	const created = (s) => Date.parse(s.created ?? "");
	const target = here
		.filter(
			(s) =>
				(s.messageCount ?? 0) === 0 &&
				(Number.isNaN(created(s))
					? !baseline.has(key(s))
					: created(s) >= startedAt - PROMPT_CLOCK_SLACK_MS),
		)
		.sort((a, b) => (created(a) || 0) - (created(b) || 0))[0];
	if (!target) {
		if (Date.now() - startedAt > PROMPT_TIMEOUT_MS) promptPending = false;
		return;
	}
	if (
		await sendMessage(
			target.id ?? key(target),
			readFileSync(promptFile, "utf8"),
		)
	) {
		promptPending = false;
		rmSync(dirname(promptFile), { recursive: true, force: true });
		return;
	}
	sendAttempts += 1;
	if (sendAttempts >= MAX_SEND_ATTEMPTS) promptPending = false;
}

// Sessions already busy in this directory before launch belong to someone
// else; this terminal's session is the first one here that starts or changes.
const baseline = new Map();
let tracked = null;
let working = false;
let started = false;

function parentAlive() {
	try {
		process.kill(parentPid, 0);
		return true;
	} catch {
		return false;
	}
}

async function finish() {
	if (tracked && working) await report("Stop", tracked);
	if (tracked) await report("SessionEnd", tracked);
	process.exit(0);
}
process.on("SIGTERM", finish);
process.on("SIGINT", finish);

const first = await listSessions();
for (const s of first ?? []) {
	if (canonical(s.cwd ?? "") === cwd) baseline.set(key(s), s.modified ?? "");
}

async function tick() {
	if (!parentAlive()) return finish();
	const sessions = await listSessions();
	if (sessions) {
		const here = sessions.filter((s) => canonical(s.cwd ?? "") === cwd);
		await deliverPrompt(here);
		let current = tracked ? here.find((s) => key(s) === tracked) : null;
		if (!current && !tracked) {
			current =
				here.find((s) => !baseline.has(key(s)) && s.attachedClients > 0) ??
				here.find(
					(s) =>
						baseline.has(key(s)) &&
						baseline.get(key(s)) !== (s.modified ?? "") &&
						s.attachedClients > 0,
				) ??
				null;
			if (current) tracked = key(current);
		}
		if (current) {
			if (!started) {
				started = true;
				await report("SessionStart", tracked);
			}
			const nowWorking = isWorking(current);
			if (nowWorking !== working) {
				working = nowWorking;
				await report(nowWorking ? "Start" : "Stop", tracked);
			}
		}
	}
	setTimeout(tick, POLL_MS);
}
tick();
