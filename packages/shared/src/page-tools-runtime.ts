import {
	MAX_PAGE_TOOL_NAME_LENGTH,
	PAGE_TOOL_CALL_TIMEOUT_MS,
	TOOLS_FRAME_CHANNEL,
	TOOLS_HOST_CHANNEL,
} from "./page-tools";

const HELLO_TIMEOUT_MS = 2000;

export function pageToolsRuntimeSource({
	helloTimeoutMs = HELLO_TIMEOUT_MS,
	callTimeoutMs = PAGE_TOOL_CALL_TIMEOUT_MS,
}: {
	helloTimeoutMs?: number;
	callTimeoutMs?: number;
} = {}): string {
	return `(() => {
	const FRAME = ${JSON.stringify(TOOLS_FRAME_CHANNEL)};
	const HOST = ${JSON.stringify(TOOLS_HOST_CHANNEL)};
	const MAX_NAME = ${MAX_PAGE_TOOL_NAME_LENGTH};
	const HELLO_TIMEOUT_MS = ${helloTimeoutMs};
	const CALL_TIMEOUT_MS = ${callTimeoutMs};
	const DOCUMENT = Math.random().toString(36).slice(2, 10);
	const pending = new Map();
	let seq = 0;
	let settleReady = null;
	let state = "waiting";

	const ready = new Promise((resolve) => { settleReady = resolve; });
	const settle = (value) => {
		if (!settleReady) return;
		const done = settleReady;
		settleReady = null;
		done(value);
	};
	const fail = (code, message) => {
		const error = new Error(message);
		error.code = code;
		return error;
	};
	const post = (message) => parent.postMessage({ channel: FRAME, ...message }, "*");

	if (parent === window) {
		state = "absent";
		settle(false);
	} else {
		const deadline = Date.now() + HELLO_TIMEOUT_MS;
		const knock = () => {
			if (!settleReady) return;
			if (Date.now() > deadline) { state = "absent"; settle(false); return; }
			post({ type: "hello" });
			setTimeout(knock, 200);
		};
		knock();
	}

	addEventListener("message", (event) => {
		const data = event.data;
		if (!data || data.channel !== HOST) return;
		if (event.source !== parent) return;
		if (data.type === "ready") {
			state = data.available
				? "available"
				: data.reason === "signed_out" ? "signed_out" : "unavailable";
			settle(Boolean(data.available));
			return;
		}
		const entry = pending.get(data.id);
		if (!entry) return;
		if (data.type === "pending") {
			entry.restart();
			return;
		}
		if (data.type === "result") {
			entry.settle();
			if (data.ok) entry.resolve(data.result);
			else entry.reject(fail(data.code, data.message));
		}
	});

	const checkName = (value, what) => {
		if (typeof value !== "string" || !value.length || value.length > MAX_NAME) {
			throw fail("invalid", "A " + what + " name is 1 to " + MAX_NAME + " characters");
		}
		return value;
	};

	const tools = {
		ready,
		async call(plugin, tool, args) {
			const request = {
				plugin: checkName(plugin, "plugin"),
				tool: checkName(tool, "tool"),
				args: args ?? {},
			};
			if (typeof request.args !== "object" || Array.isArray(request.args)) {
				throw fail("invalid", "Tool args must be an object");
			}
			await ready;
			if (state === "signed_out") {
				throw fail("unavailable_signed_out", "Sign in to Superset to use this page's tools");
			}
			if (state !== "available") {
				throw fail("unavailable", "Tools are not available in this view");
			}
			const id = DOCUMENT + "." + ++seq;
			return new Promise((resolve, reject) => {
				let timer = null;
				const settle = () => {
					clearTimeout(timer);
					pending.delete(id);
				};
				const restart = () => {
					clearTimeout(timer);
					timer = setTimeout(() => {
						settle();
						reject(fail("unavailable", "The tool did not answer in time"));
					}, CALL_TIMEOUT_MS);
				};
				pending.set(id, { resolve, reject, settle, restart });
				try {
					post({ type: "call", id, request });
				} catch {
					settle();
					reject(fail("invalid", "Tool args must be plain data that can be copied"));
					return;
				}
				restart();
			});
		},
	};

	window.superset = window.superset || {};
	window.superset.tools = tools;
})();`;
}

export const PAGE_TOOLS_RUNTIME_SOURCE = pageToolsRuntimeSource();
