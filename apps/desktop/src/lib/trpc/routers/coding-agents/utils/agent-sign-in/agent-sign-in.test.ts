import { describe, expect, test } from "bun:test";
import {
	type AgentLoginProcess,
	type AgentSignInEvent,
	findSignInUrl,
	runAgentSignIn,
} from "./agent-sign-in";

function fakeProcess() {
	let emitOutput: (chunk: string) => void = () => {};
	let exit: (code: number | null) => void = () => {};
	const written: string[] = [];
	let killed = false;
	const process: AgentLoginProcess = {
		onOutput: (listener) => {
			emitOutput = listener;
		},
		write: (text) => written.push(text),
		exited: new Promise((resolve) => {
			exit = resolve;
		}),
		kill: () => {
			killed = true;
			exit(null);
		},
	};
	return {
		process,
		written,
		output: (chunk: string) => emitOutput(chunk),
		exit: (code: number | null) => exit(code),
		killed: () => killed,
	};
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("findSignInUrl", () => {
	test("finds the agent's own sign-in page and skips other hosts", () => {
		expect(
			findSignInUrl(
				"claude",
				"Opening browser…\nvisit: https://evil.example/x https://claude.com/cai/oauth/authorize?code=true\n",
			),
		).toBe("https://claude.com/cai/oauth/authorize?code=true");
		expect(
			findSignInUrl(
				"codex",
				"\u001b[94mhttps://auth.openai.com/codex/device\u001b[0m",
			),
		).toBe("https://auth.openai.com/codex/device");
		expect(findSignInUrl("codex", "https://claude.ai/login")).toBeNull();
	});
});

describe("runAgentSignIn", () => {
	test("passes the page on, writes a pasted code, and ends on exit 0", async () => {
		const fake = fakeProcess();
		const events: AgentSignInEvent[] = [];
		let args: string[] = [];
		const handle = runAgentSignIn({
			agent: "claude",
			spawn: (spawnArgs) => {
				args = spawnArgs;
				return fake.process;
			},
			onEvent: (event) => events.push(event),
		});
		expect(args).toEqual(["auth", "login", "--claudeai"]);
		fake.output("visit: https://claude.ai/oauth/authorize?x=1\n");
		handle.submitCode(" abc#def \n");
		fake.exit(0);
		await tick();
		expect(fake.written).toEqual(["abc#def\n"]);
		expect(events).toEqual([
			{ type: "url", url: "https://claude.ai/oauth/authorize?x=1" },
			{ type: "done" },
		]);
		handle.stop();
	});

	test("fails on a non-zero exit", async () => {
		const fake = fakeProcess();
		const events: AgentSignInEvent[] = [];
		runAgentSignIn({
			agent: "codex",
			spawn: () => fake.process,
			onEvent: (event) => events.push(event),
		});
		fake.exit(1);
		await tick();
		expect(events).toEqual([{ type: "failed", reason: "exited" }]);
	});

	test("gives up and stops the login after the timeout", async () => {
		const fake = fakeProcess();
		const events: AgentSignInEvent[] = [];
		runAgentSignIn({
			agent: "codex",
			spawn: () => fake.process,
			onEvent: (event) => events.push(event),
			timeoutMs: 5,
		});
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(fake.killed()).toBe(true);
		expect(events).toEqual([{ type: "failed", reason: "timeout" }]);
	});
});
