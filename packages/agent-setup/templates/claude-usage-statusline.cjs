const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { createHash, randomUUID } = require("node:crypto");
const { spawnSync } = require("node:child_process");

const MAX_INPUT = 512 * 1024;
function readJson(file) {
	const info = fs.statSync(file);
	if (!info.isFile() || info.size > MAX_INPUT)
		throw new Error("Invalid settings");
	const value = JSON.parse(fs.readFileSync(file, "utf8"));
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new Error("Invalid settings");
	return value;
}
function optionalSettings(file) {
	try {
		return readJson(file);
	} catch (error) {
		if (error.code === "ENOENT") return {};
		throw error;
	}
}
function quote(value) {
	return `'${value.replaceAll("'", "'\\''")}'`;
}
function prepare(args) {
	if (
		process.env.SUPERSET_NATIVE_CLAUDE_USAGE !== "1" ||
		process.env.SUPERSET_PINNED_ACCOUNT !== "CLAUDE_CONFIG_DIR" ||
		!process.env.SUPERSET_TERMINAL_ID ||
		!process.env.SUPERSET_AGENT_LAUNCH_ID ||
		!process.env.SUPERSET_ACCOUNT_ATTRIBUTION_TOKEN ||
		process.env.SUPERSET_AGENT_ID !== "claude"
	)
		return;
	for (const arg of args) {
		if (arg === "--") break;
		if (
			/^(--settings|--setting-sources|--output-format|--input-format|--print|--bare|--help|--version|--resume|--continue|--fork-session|--remote|--teleport)(=|$)/.test(
				arg,
			) ||
			[
				"-p",
				"-h",
				"-V",
				"-v",
				"-r",
				"-c",
				"attach",
				"resume",
				"agents",
				"sessions",
				"background",
			].includes(arg)
		)
			return;
	}
	const config =
		process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
	for (const file of [
		path.join(config, "managed-settings.json"),
		"/Library/Application Support/ClaudeCode/managed-settings.json",
		"/etc/claude-code/managed-settings.json",
	])
		if (fs.existsSync(file)) return;
	const cwd = process.cwd();
	const git = spawnSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
		timeout: 1000,
	});
	const root = git.status === 0 ? git.stdout.trim() : cwd;
	// Claude's directory traversal can select parent settings. Preserve unknown precedence.
	if (path.resolve(root) !== path.resolve(cwd)) return;
	for (
		let parent = path.dirname(cwd);
		parent !== path.dirname(parent);
		parent = path.dirname(parent)
	) {
		if (
			fs.existsSync(path.join(parent, ".claude", "settings.json")) ||
			fs.existsSync(path.join(parent, ".claude", "settings.local.json"))
		)
			return;
	}
	const files = [
		path.join(config, "settings.json"),
		path.join(root, ".claude", "settings.json"),
		path.join(root, ".claude", "settings.local.json"),
	];
	let original;
	for (const file of files) {
		const settings = optionalSettings(file);
		if (Object.hasOwn(settings, "statusLine")) original = settings.statusLine;
	}
	if (
		original !== undefined &&
		(!original ||
			typeof original !== "object" ||
			original.type !== "command" ||
			typeof original.command !== "string" ||
			original.command.length > 65536)
	)
		return;
	const saved = Buffer.from(JSON.stringify(original || {})).toString(
		"base64url",
	);
	const command = `ELECTRON_RUN_AS_NODE=1 ${quote(process.execPath)} ${quote(__filename)} --status ${quote(saved)}`;
	process.stdout.write(
		JSON.stringify({
			statusLine: { ...(original || {}), type: "command", command },
		}),
	);
}
function sanitize(data) {
	if (
		!data ||
		typeof data !== "object" ||
		Array.isArray(data) ||
		typeof data.session_id !== "string" ||
		!data.session_id ||
		data.session_id.length > 256 ||
		data.agent?.name
	)
		return null;
	const cost = data.cost?.total_api_duration_ms;
	const result = {
		session_id: data.session_id,
		cost: {
			total_api_duration_ms:
				typeof cost === "number" && Number.isFinite(cost) && cost >= 0
					? cost
					: null,
		},
		rate_limits: {},
	};
	for (const id of ["five_hour", "seven_day"]) {
		const window = data.rate_limits?.[id];
		if (
			window &&
			typeof window.used_percentage === "number" &&
			Number.isFinite(window.used_percentage) &&
			window.used_percentage >= 0 &&
			window.used_percentage <= 100 &&
			typeof window.resets_at === "number" &&
			Number.isFinite(window.resets_at)
		)
			result.rate_limits[id] = {
				used_percentage: window.used_percentage,
				resets_at: window.resets_at,
			};
	}
	return result;
}
function frameMarker(data) {
	const home = process.env.SUPERSET_HOME_DIR;
	if (!home) return null;
	const directory = path.join(home, "state", "native-claude-feed");
	try {
		fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
		const info = fs.lstatSync(directory);
		if (
			!info.isDirectory() ||
			info.isSymbolicLink() ||
			(process.platform !== "win32" &&
				((info.mode & 0o077) !== 0 || info.uid !== process.getuid()))
		)
			return null;
		const hash = (value) =>
			createHash("sha256").update(JSON.stringify(value)).digest("hex");
		const file = path.join(
			directory,
			`${hash([process.env.SUPERSET_TERMINAL_ID, process.env.SUPERSET_AGENT_LAUNCH_ID])}.json`,
		);
		const signature = hash(data);
		const read = (file) => {
			const fd = fs.openSync(
				file,
				fs.constants.O_RDONLY |
					fs.constants.O_NOFOLLOW |
					fs.constants.O_NONBLOCK,
			);
			try {
				const stat = fs.fstatSync(fd);
				if (
					!stat.isFile() ||
					stat.nlink !== 1 ||
					stat.size > 1024 ||
					(process.platform !== "win32" &&
						((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid()))
				)
					throw new Error("Unsafe marker");
				const value = JSON.parse(fs.readFileSync(fd, "utf8"));
				if (
					value.version !== 1 ||
					!/^[a-f0-9]{64}$/.test(value.signature) ||
					typeof value.accepted !== "boolean" ||
					!Number.isFinite(value.updatedAt)
				)
					throw new Error("Unknown marker");
				return value;
			} finally {
				fs.closeSync(fd);
			}
		};
		let previous;
		try {
			previous = read(file);
		} catch (error) {
			if (error.code !== "ENOENT") return null;
		}
		const now = Date.now();
		if (
			previous?.signature === signature &&
			previous.updatedAt <= now &&
			now - previous.updatedAt < (previous.accepted ? 24 * 60 * 60_000 : 10_000)
		)
			return { skip: true };
		if (!previous) {
			const entries = fs.readdirSync(directory);
			if (entries.length > 1024) return null;
			const markers = entries
				.filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
				.map((name) => ({
					file: path.join(directory, name),
					value: read(path.join(directory, name)),
				}))
				.sort((a, b) => a.value.updatedAt - b.value.updatedAt);
			while (markers.length >= 256) fs.unlinkSync(markers.shift().file);
		}
		return {
			skip: false,
			write(accepted) {
				const temporary = `${file}.${randomUUID()}.tmp`;
				try {
					fs.writeFileSync(
						temporary,
						JSON.stringify({
							version: 1,
							signature,
							accepted,
							updatedAt: Date.now(),
						}),
						{ flag: "wx", mode: 0o600 },
					);
					fs.renameSync(temporary, file);
				} finally {
					try {
						fs.unlinkSync(temporary);
					} catch {}
				}
			},
		};
	} catch {
		return null;
	}
}
function endpointCandidates() {
	const urls = [process.env.SUPERSET_HOST_AGENT_HOOK_URL];
	const directory = path.join(
		process.env.SUPERSET_HOME_DIR || path.join(os.homedir(), ".superset"),
		"host",
	);
	try {
		for (const entry of fs.readdirSync(directory).slice(0, 32)) {
			try {
				urls.push(
					new URL(
						"/trpc/notifications.hook",
						readJson(path.join(directory, entry, "manifest.json")).endpoint,
					).href,
				);
			} catch {}
		}
	} catch {}
	return [...new Set(urls)].slice(0, 4).flatMap((candidate) => {
		try {
			const url = new URL(candidate);
			return url.protocol === "http:" &&
				["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
				!url.username &&
				!url.password &&
				url.pathname === "/trpc/notifications.hook"
				? [url]
				: [];
		} catch {
			return [];
		}
	});
}
function post(url, body, deadline) {
	return new Promise((resolve) => {
		let settled = false;
		let timer;
		const finish = (accepted) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(accepted);
		};
		const request = http.request(
			url,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Content-Length": Buffer.byteLength(body),
				},
				timeout: 250,
			},
			(response) => {
				let text = "";
				response.on("data", (chunk) => {
					text += chunk;
					if (text.length > 4096) {
						response.destroy();
						request.destroy();
						finish(false);
					}
				});
				response.on("end", () => finish(/"ignored"\s*:\s*false/.test(text)));
				response.on("error", () => finish(false));
			},
		);
		request.on("timeout", () => request.destroy());
		request.on("error", () => finish(false));
		timer = setTimeout(
			() => {
				request.destroy();
				finish(false);
			},
			Math.max(1, deadline - Date.now()),
		);
		request.end(body);
	});
}
async function status(encoded) {
	let input;
	try {
		input = fs.readFileSync(0);
	} catch {
		return;
	}
	if (input.length > MAX_INPUT) return;
	let original;
	try {
		original = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
	} catch {
		return;
	}
	let code = 0;
	if (typeof original.command === "string" && original.command) {
		const output = spawnSync(original.command, {
			shell: true,
			input,
			maxBuffer: MAX_INPUT,
			env: process.env,
		});
		if (output.stdout) process.stdout.write(output.stdout);
		if (output.stderr) process.stderr.write(output.stderr);
		code = typeof output.status === "number" ? output.status : 1;
	}
	try {
		const data = sanitize(JSON.parse(input));
		if (
			data &&
			process.env.SUPERSET_NATIVE_CLAUDE_USAGE === "1" &&
			process.env.SUPERSET_PINNED_ACCOUNT === "CLAUDE_CONFIG_DIR" &&
			process.env.SUPERSET_AGENT_ID === "claude" &&
			process.env.SUPERSET_TERMINAL_ID &&
			process.env.SUPERSET_AGENT_LAUNCH_ID &&
			process.env.SUPERSET_ACCOUNT_ATTRIBUTION_TOKEN
		) {
			const marker = frameMarker(data);
			if (!marker || marker.skip) {
				process.exitCode = code;
				return;
			}
			const body = JSON.stringify({
				json: {
					terminalId: process.env.SUPERSET_TERMINAL_ID,
					launchId: process.env.SUPERSET_AGENT_LAUNCH_ID,
					attributionToken: process.env.SUPERSET_ACCOUNT_ATTRIBUTION_TOKEN,
					agent: { agentId: "claude", sessionId: data.session_id },
					nativeClaudeUsage: data,
				},
			});
			const deadline = Date.now() + 500;
			let accepted = false;
			for (const url of endpointCandidates()) {
				if (Date.now() >= deadline) break;
				if (await post(url, body, deadline)) {
					accepted = true;
					break;
				}
			}
			marker.write(accepted);
		}
	} catch {}
	process.exitCode = code;
}
if (process.argv[2] === "--prepare") {
	try {
		prepare(process.argv.slice(3));
	} catch {}
} else if (process.argv[2] === "--status") {
	status(process.argv[3] || "").catch(() => {});
}
