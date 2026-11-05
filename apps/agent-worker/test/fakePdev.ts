#!/usr/bin/env bun
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

const agentDir = process.env.PARADEV_CODING_AGENT_DIR as string;
const sessionsDir = join(agentDir, "sessions", "--work--");
const log = (event: Record<string, unknown>) => {
	if (process.env.FAKE_PDEV_LOG)
		appendFileSync(process.env.FAKE_PDEV_LOG, `${JSON.stringify(event)}\n`);
};
const send = (frame: unknown) =>
	process.stdout.write(`${JSON.stringify(frame)}\n`);
const update = (u: Record<string, unknown>) =>
	send({
		jsonrpc: "2.0",
		method: "session/update",
		params: { sessionId, update: u },
	});

let sessionId = "";
let file = "";
let n = 0;
let hanging = false;
const entry = (e: Record<string, unknown>) =>
	appendFileSync(
		file,
		`${JSON.stringify({ id: `e${++n}-${Date.now()}`, timestamp: new Date().toISOString(), ...e })}\n`,
	);

log({
	event: "start",
	env: Object.fromEntries(
		Object.entries(process.env).filter(
			([k]) => k.startsWith("PDEV_") || k === "HOME",
		),
	),
	settings: existsSync(join(agentDir, "settings.json"))
		? readFileSync(join(agentDir, "settings.json"), "utf8")
		: null,
	appendSystem: existsSync(join(agentDir, "APPEND_SYSTEM.md"))
		? readFileSync(join(agentDir, "APPEND_SYSTEM.md"), "utf8")
		: null,
	mcp: existsSync(join(agentDir, "mcp.json"))
		? readFileSync(join(agentDir, "mcp.json"), "utf8")
		: null,
});

function run(text: string) {
	update({ sessionUpdate: "state_update", state: "running" });
	entry({
		type: "message",
		message: { role: "user", content: [{ type: "text", text }] },
	});
	if (text.includes("crash")) process.exit(3);
	if (text.includes("hang")) {
		hanging = true;
		update({
			sessionUpdate: "tool_call",
			toolCallId: "call_1",
			title: "sleep",
			status: "in_progress",
		});
		entry({
			type: "message",
			message: {
				role: "assistant",
				content: [
					{
						type: "toolCall",
						id: "call_1",
						name: "bash",
						arguments: { command: "sleep 100" },
					},
				],
				usage: { input: 3, output: 1, cost: { total: 0.001 } },
			},
		});
		return;
	}
	if (text.includes("subagent")) {
		const child = `${sessionId}-child`;
		update({
			sessionUpdate: "subagent_update",
			sessionId: child,
			state: { state: "running" },
		});
		update({
			sessionUpdate: "state_update",
			state: "idle",
			stopReason: "end_turn",
		});
		send({
			jsonrpc: "2.0",
			method: "session/update",
			params: {
				sessionId: child,
				update: {
					sessionUpdate: "state_update",
					state: "idle",
					stopReason: "end_turn",
				},
			},
		});
		setTimeout(() => {
			update({
				sessionUpdate: "subagent_update",
				sessionId: child,
				state: { state: "idle" },
			});
			update({ sessionUpdate: "state_update", state: "running" });
			entry({
				type: "message",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "subagent finished" }],
					usage: { input: 1, output: 1, cost: { total: 0 } },
				},
			});
			update({
				sessionUpdate: "state_update",
				state: "idle",
				stopReason: "end_turn",
			});
		}, 300);
		return;
	}
	const modelError = /model error: (.*)/.exec(text)?.[1];
	if (modelError) {
		entry({
			type: "message",
			message: {
				role: "assistant",
				content: [],
				stopReason: "error",
				errorMessage: modelError,
				usage: { input: 0, output: 0, cost: { total: 0 } },
			},
		});
		update({
			sessionUpdate: "state_update",
			state: "idle",
			stopReason: "error",
		});
		return;
	}
	if (text.includes("use the reply tool")) {
		entry({
			type: "message",
			message: {
				role: "assistant",
				content: [
					{
						type: "toolCall",
						id: "call_r",
						name: "mcp__dev__reply",
						arguments: { target: "channel:x", body: "hi" },
					},
				],
				usage: { input: 1, output: 1, cost: { total: 0 } },
			},
		});
		entry({
			type: "message",
			message: {
				role: "toolResult",
				toolCallId: "call_r",
				toolName: "mcp__dev__reply",
				content: [{ type: "text", text: "{}" }],
			},
		});
	}
	const reply = `reply to: ${text}`;
	update({
		sessionUpdate: "agent_message_chunk",
		messageId: `m${n}`,
		content: { type: "text", text: reply },
	});
	entry({
		type: "message",
		message: {
			role: "assistant",
			content: [{ type: "text", text: reply }],
			usage: { input: 10, output: 5, cacheRead: 2, cost: { total: 0.002 } },
		},
	});
	update({
		sessionUpdate: "state_update",
		state: "idle",
		stopReason: "end_turn",
	});
}

for await (const line of createInterface({ input: process.stdin })) {
	const msg = JSON.parse(line) as {
		id?: number;
		method?: string;
		params?: {
			cwd: string;
			sessionId: string;
			prompt: Array<{ text: string }>;
		};
	};
	log({ event: "rpc", method: msg.method, params: msg.params });
	if (msg.method === "initialize")
		send({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: 2 } });
	else if (msg.method === "session/new") {
		sessionId = `pdev-${Date.now()}`;
		mkdirSync(sessionsDir, { recursive: true });
		file = join(sessionsDir, `f_${sessionId}.jsonl`);
		writeFileSync(
			file,
			`${JSON.stringify({ type: "session", id: sessionId, cwd: msg.params.cwd })}\n`,
		);
		send({ jsonrpc: "2.0", id: msg.id, result: { sessionId } });
	} else if (msg.method === "session/resume") {
		sessionId = msg.params.sessionId;
		const name = readdirSync(sessionsDir).find((f) =>
			f.endsWith(".jsonl"),
		) as string;
		file = join(sessionsDir, name);
		log({
			event: "resumed",
			entries: readFileSync(file, "utf8").trim().split("\n").length,
		});
		send({ jsonrpc: "2.0", id: msg.id, result: {} });
	} else if (msg.method === "session/set_config_option") {
		send({ jsonrpc: "2.0", id: msg.id, result: { configOptions: [] } });
	} else if (msg.method === "session/prompt") {
		send({ jsonrpc: "2.0", id: msg.id, result: { messageId: `user-${n}` } });
		run(msg.params.prompt[0].text);
	} else if (msg.method === "session/cancel") {
		if (hanging) {
			hanging = false;
			update({
				sessionUpdate: "state_update",
				state: "idle",
				stopReason: "cancelled",
			});
		}
	}
}
