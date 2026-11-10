import type { ManagedCodingAgent } from "@superset/agent-setup/managed-agent-binaries";

export type AgentSignInEvent =
	| { type: "url"; url: string }
	| { type: "done" }
	| { type: "failed"; reason: "exited" | "timeout" };

export interface AgentLoginProcess {
	onOutput: (listener: (chunk: string) => void) => void;
	write: (text: string) => void;
	exited: Promise<number | null>;
	kill: () => void;
}

export interface AgentSignInHandle {
	submitCode: (code: string) => void;
	stop: () => void;
}

export const SIGN_IN_TIMEOUT_MS = 10 * 60_000;

const LOGIN_ARGS: Record<ManagedCodingAgent, string[]> = {
	claude: ["auth", "login", "--claudeai"],
	codex: ["login"],
};

const SIGN_IN_HOSTS: Record<ManagedCodingAgent, string[]> = {
	claude: [
		"claude.ai",
		"claude.com",
		"platform.claude.com",
		"console.anthropic.com",
	],
	codex: ["auth.openai.com", "chatgpt.com"],
};

export function agentLoginArgs(agent: ManagedCodingAgent): string[] {
	return LOGIN_ARGS[agent];
}

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

/** The first sign-in page the agent printed, only on that agent's own hosts. */
export function findSignInUrl(
	agent: ManagedCodingAgent,
	output: string,
): string | null {
	const text = output.replace(ANSI_PATTERN, "");
	for (const match of text.matchAll(/https:\/\/[^\s"'<>]+/g)) {
		try {
			const url = new URL(match[0]);
			if (SIGN_IN_HOSTS[agent].includes(url.hostname)) return url.toString();
		} catch {}
	}
	return null;
}

/**
 * Runs the agent's own login. The agent opens the browser itself; the page it
 * printed is passed on so the user can open it again or paste a code back.
 */
export function runAgentSignIn(options: {
	agent: ManagedCodingAgent;
	spawn: (args: string[]) => AgentLoginProcess;
	onEvent: (event: AgentSignInEvent) => void;
	timeoutMs?: number;
}): AgentSignInHandle {
	let finished = false;
	const child = options.spawn(agentLoginArgs(options.agent));
	const finish = (event: AgentSignInEvent) => {
		if (finished) return;
		finished = true;
		clearTimeout(timer);
		options.onEvent(event);
	};
	const timer = setTimeout(() => {
		child.kill();
		finish({ type: "failed", reason: "timeout" });
	}, options.timeoutMs ?? SIGN_IN_TIMEOUT_MS);

	let output = "";
	let sentUrl = false;
	child.onOutput((chunk) => {
		if (sentUrl) return;
		output = (output + chunk).slice(-8192);
		const url = findSignInUrl(options.agent, output);
		if (url) {
			sentUrl = true;
			options.onEvent({ type: "url", url });
		}
	});
	void child.exited.then((code) =>
		finish(
			code === 0 ? { type: "done" } : { type: "failed", reason: "exited" },
		),
	);

	return {
		submitCode: (code) => {
			if (!finished) child.write(`${code.trim()}\n`);
		},
		stop: () => {
			finished = true;
			clearTimeout(timer);
			child.kill();
		},
	};
}
