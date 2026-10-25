import { execFile } from "node:child_process";
import { type BigIntStats, constants } from "node:fs";
import { lstat, open, readlink, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, normalize } from "node:path";
import { promisify } from "node:util";
import { getExecutablePath } from "@superset/macos-process-metrics";

const execFileAsync = promisify(execFile);
const MAX_BYTES = 512 * 1024;
const MAX_PROCESSES = 8192;
const MAX_DESCENDANTS = 128;
const MAX_DEPTH = 32;
const VERSION = /^\d+\.\d+\.\d+(?:[-.][a-zA-Z0-9]+)*$/;
const BACKGROUND_ID =
	/^(?:[a-f0-9]{8}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/;
const FAILURE = "The native Claude process identity could not be verified.";

interface FileIdentity {
	uid: number;
	mode: number;
	ino: number;
	dev: number;
	isFile(): boolean;
	isDirectory(): boolean;
}

interface ExecutableFileIdentity {
	uid: number;
	mode: number;
	ino: number;
	dev: number;
	size: number;
	links: number;
	mtimeNs: string;
	ctimeNs: string;
}

export interface NativeClaudeProcessIO {
	/** Kernel main image; never the current launcher target or an arbitrary mapping. */
	mainImagePath(pid: number): Promise<string | null>;
	/** No-follow opened file and current name must match throughout this observation. */
	executableFile(path: string): Promise<ExecutableFileIdentity>;
	run(
		file: string,
		args: string[],
		options: { signal: AbortSignal; timeout: number; maxBuffer: number },
	): Promise<string>;
	read(path: string, signal: AbortSignal): Promise<Buffer>;
	realpath(path: string): Promise<string>;
	readlink(path: string): Promise<string>;
	stat(path: string): Promise<FileIdentity>;
}

export interface NativeClaudeProcessOptions {
	platform?: NodeJS.Platform;
	uid?: number;
	home?: string;
	allowedExecutables?: readonly string[];
	signal?: AbortSignal;
	io?: NativeClaudeProcessIO;
}

export interface NativeProcessIncarnation {
	pid: number;
	parentPid: number;
	birth: string;
	uid: number;
}

export interface NativeClaudeProcess extends NativeProcessIncarnation {
	executable: string;
	cwd: string;
	configDir: string;
	/** Only a strictly parsed attachment command is returned; other argv is private. */
	args: string[];
}

export interface NativeClaudeTerminalClient extends NativeClaudeProcess {
	ancestors: NativeProcessIncarnation[];
}

export interface NativeClaudeAttachClient extends NativeClaudeTerminalClient {
	backgroundId: string;
}

interface ProcessRow extends NativeProcessIncarnation {
	command: string;
	state: string;
}

interface Context {
	platform: "darwin" | "linux";
	uid: number;
	home: string;
	allowedExecutables: readonly string[];
	signal: AbortSignal;
	io: NativeClaudeProcessIO;
}

function refuse(): never {
	throw new Error(FAILURE);
}

function check(signal: AbortSignal) {
	if (signal.aborted) refuse();
}

function bounded<T>(signal: AbortSignal, operation: () => Promise<T>) {
	check(signal);
	return new Promise<T>((resolve, reject) => {
		const abort = () => reject(new Error(FAILURE));
		signal.addEventListener("abort", abort, { once: true });
		operation()
			.then(resolve, reject)
			.finally(() => {
				signal.removeEventListener("abort", abort);
			});
	});
}

function validPid(pid: number) {
	return Number.isSafeInteger(pid) && pid > 0 && pid <= 2_147_483_647;
}

function hasControl(value: string) {
	return [...value].some((character) => {
		const code = character.charCodeAt(0);
		return code < 32 || code === 127;
	});
}

function canonicalPath(value: string) {
	if (!isAbsolute(value) || value !== normalize(value) || hasControl(value))
		refuse();
	return value;
}

function sameImageFile(a: ExecutableFileIdentity, b: ExecutableFileIdentity) {
	return (
		[
			"uid",
			"mode",
			"ino",
			"dev",
			"size",
			"links",
			"mtimeNs",
			"ctimeNs",
		] as const
	).every((key) => a[key] === b[key]);
}

function imageFileFacts(info: BigIntStats): ExecutableFileIdentity {
	if (!info.isFile()) refuse();
	const value = {
		uid: Number(info.uid),
		mode: Number(info.mode),
		ino: Number(info.ino),
		dev: Number(info.dev),
		size: Number(info.size),
		links: Number(info.nlink),
		mtimeNs: info.mtimeNs.toString(),
		ctimeNs: info.ctimeNs.toString(),
	};
	if (
		![
			value.uid,
			value.mode,
			value.ino,
			value.dev,
			value.size,
			value.links,
		].every(Number.isSafeInteger)
	)
		refuse();
	return value;
}

const defaultIO: NativeClaudeProcessIO = {
	async mainImagePath(pid) {
		return getExecutablePath(pid);
	},
	async executableFile(path) {
		const file = await open(
			path,
			constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
		);
		try {
			const before = imageFileFacts(await file.stat({ bigint: true }));
			const named = imageFileFacts(await lstat(path, { bigint: true }));
			const after = imageFileFacts(await file.stat({ bigint: true }));
			if (!sameImageFile(before, named) || !sameImageFile(before, after))
				refuse();
			return after;
		} finally {
			await file.close();
		}
	},
	async run(file, args, options) {
		const { stdout } = await execFileAsync(file, args, {
			...options,
			env: { ...process.env, TZ: "UTC", LC_ALL: "C" },
			encoding: "utf8",
		});
		return stdout;
	},
	async read(path, signal) {
		check(signal);
		const file = await open(
			path,
			constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
		);
		try {
			if (!(await file.stat()).isFile()) refuse();
			const buffer = Buffer.alloc(MAX_BYTES + 1);
			let size = 0;
			while (size < buffer.length) {
				check(signal);
				const { bytesRead } = await file.read(
					buffer,
					size,
					buffer.length - size,
					size,
				);
				if (bytesRead === 0) break;
				size += bytesRead;
			}
			check(signal);
			if (size > MAX_BYTES) refuse();
			return buffer.subarray(0, size);
		} finally {
			await file.close();
		}
	},
	realpath,
	readlink,
	stat,
};

async function context(options: NativeClaudeProcessOptions): Promise<Context> {
	const platform = options.platform ?? process.platform;
	const uid = options.uid ?? process.getuid?.();
	if (
		(platform !== "darwin" && platform !== "linux") ||
		uid === undefined ||
		!Number.isSafeInteger(uid) ||
		uid < 0
	)
		refuse();
	const signal = options.signal
		? AbortSignal.any([options.signal, AbortSignal.timeout(5000)])
		: AbortSignal.timeout(5000);
	check(signal);
	const original = options.io ?? defaultIO;
	const io: NativeClaudeProcessIO = {
		mainImagePath: (pid) => bounded(signal, () => original.mainImagePath(pid)),
		executableFile: (path) =>
			bounded(signal, () => original.executableFile(path)),
		run: (file, args, runOptions) =>
			bounded(signal, () => original.run(file, args, runOptions)),
		read: (path, readSignal) =>
			bounded(signal, () => original.read(path, readSignal)),
		realpath: (path) => bounded(signal, () => original.realpath(path)),
		readlink: (path) => bounded(signal, () => original.readlink(path)),
		stat: (path) => bounded(signal, () => original.stat(path)),
	};
	const home = canonicalPath(await io.realpath(options.home ?? homedir()));
	check(signal);
	return {
		platform,
		uid,
		home,
		allowedExecutables: options.allowedExecutables ?? [],
		signal,
		io,
	};
}

async function run(ctx: Context, file: string, args: string[]) {
	check(ctx.signal);
	const value = await ctx.io.run(file, args, {
		signal: ctx.signal,
		timeout: 1500,
		maxBuffer: MAX_BYTES,
	});
	check(ctx.signal);
	if (Buffer.byteLength(value) > MAX_BYTES || value.includes("\0")) refuse();
	return value;
}

async function processTable(ctx: Context, pid?: number) {
	const output = await run(ctx, "/bin/ps", [
		"-ww",
		...(pid === undefined ? ["-U", String(ctx.uid)] : ["-p", String(pid)]),
		"-o",
		"pid=,ppid=,uid=,state=,lstart=,comm=",
	]);
	const rows = new Map<number, ProcessRow>();
	let count = 0;
	for (const line of output.split("\n")) {
		if (!line.trim()) continue;
		if (++count > MAX_PROCESSES) refuse();
		const match =
			/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+([A-Z][a-z]{2} [A-Z][a-z]{2}\s+\d{1,2} \d{2}:\d{2}:\d{2} \d{4})\s+(.+?)\s*$/.exec(
				line,
			);
		if (!match) refuse();
		const [, pidText, parentText, uidText, state, birth, command] = match;
		if (!pidText || !parentText || !uidText || !state || !birth || !command)
			refuse();
		const row: ProcessRow = {
			pid: Number(pidText),
			parentPid: Number(parentText),
			uid: Number(uidText),
			birth: birth.replace(/\s+/g, " "),
			command,
			state,
		};
		if (
			!validPid(row.pid) ||
			!Number.isSafeInteger(row.parentPid) ||
			row.parentPid < 0 ||
			rows.has(row.pid)
		)
			refuse();
		if (row.uid !== ctx.uid) continue;
		rows.set(row.pid, row);
	}
	if (pid !== undefined && (rows.size !== 1 || !rows.has(pid))) refuse();
	return rows;
}

function active(row: ProcessRow) {
	return /^[RISUD]/.test(row.state) && !/[TZXE]/.test(row.state);
}

function sameProcess(
	a: NativeProcessIncarnation,
	b?: NativeProcessIncarnation,
) {
	return (
		b?.pid === a.pid &&
		b.parentPid === a.parentPid &&
		b.uid === a.uid &&
		b.birth === a.birth
	);
}

async function trustedExecutable(ctx: Context, path: string) {
	const executable = canonicalPath(await ctx.io.realpath(canonicalPath(path)));
	const file = await ctx.io.stat(executable);
	if (
		!file.isFile() ||
		file.uid !== ctx.uid ||
		(file.mode & 0o022) !== 0 ||
		(file.mode & 0o111) === 0
	)
		refuse();
	const nativeRoot = await ctx.io
		.realpath(join(ctx.home, ".local/share/claude/versions"))
		.catch(() => null);
	if (
		nativeRoot &&
		dirname(executable) === nativeRoot &&
		VERSION.test(basename(executable))
	)
		return { executable, file };
	for (const allowed of [
		join(ctx.home, ".local/bin/claude"),
		...ctx.allowedExecutables,
	]) {
		if ((await ctx.io.realpath(allowed).catch(() => null)) === executable)
			return { executable, file };
	}
	return refuse();
}

function attachmentArgs(
	command: string,
	executable: string,
	aliases: string[],
	allowUnresolvedAttach = false,
) {
	const prefixes = [...new Set([executable, ...aliases, "claude"])];
	for (const prefix of prefixes) {
		if (command === prefix) return [];
		if (!command.startsWith(`${prefix} `)) continue;
		const suffix = command.slice(prefix.length + 1);
		if (!suffix.startsWith("attach")) return [];
		const match = /^attach ([a-f0-9-]+)$/.exec(suffix);
		const id = match?.[1];
		if (!id || !BACKGROUND_ID.test(id)) {
			if (allowUnresolvedAttach) return [];
			return refuse();
		}
		return ["attach", id];
	}
	return refuse();
}

function environmentProfile(entries: [string, string][], ctx: Context) {
	const selected = new Map<string, string>();
	for (const [key, value] of entries) {
		if (
			key.startsWith("ANTHROPIC_") ||
			key === "CLAUDE_CODE_OAUTH_TOKEN" ||
			key === "CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR" ||
			key.startsWith("CLAUDE_CODE_USE_")
		) {
			if (value) refuse();
		}
		if (key !== "HOME" && key !== "CLAUDE_CONFIG_DIR" && key !== "PATH")
			continue;
		if (selected.has(key)) refuse();
		selected.set(key, value);
	}
	if (selected.get("HOME") !== ctx.home || !selected.get("PATH")) refuse();
	const path = selected.get("CLAUDE_CONFIG_DIR") || join(ctx.home, ".claude");
	if (!/^\/[a-zA-Z0-9_./@+-]+$/.test(path)) refuse();
	return canonicalPath(path);
}

function macEnvironment(command: string, output: string, ctx: Context) {
	const value = output.replace(/\n$/, "");
	if (!value.startsWith(`${command} `) || hasControl(value)) refuse();
	const environment = value.slice(command.length + 1);
	const matches = [
		...environment.matchAll(/(?:^| )([a-zA-Z_][a-zA-Z0-9_]*)=/g),
	];
	if (matches[0]?.index !== 0) refuse();
	const entries: [string, string][] = matches.map((match, index) => {
		const start = (match.index ?? 0) + match[0].length;
		const end = matches[index + 1]?.index ?? environment.length;
		const key = match[1];
		if (!key) refuse();
		return [key, environment.slice(start, end)];
	});
	return environmentProfile(entries, ctx);
}

async function canonicalDirectory(ctx: Context, path: string) {
	const canonical = canonicalPath(await ctx.io.realpath(path));
	const file = await ctx.io.stat(canonical);
	if (!file.isDirectory() || file.uid !== ctx.uid) refuse();
	return canonical;
}

async function macMainImage(ctx: Context, pid: number) {
	const observed = await ctx.io.mainImagePath(pid);
	if (!observed) refuse();
	const imagePath = canonicalPath(observed);
	if ((await ctx.io.realpath(imagePath)) !== imagePath) refuse();
	const imageFile = await ctx.io.executableFile(imagePath);
	let trusted: Awaited<ReturnType<typeof trustedExecutable>>;
	try {
		trusted = await trustedExecutable(ctx, imagePath);
	} catch {
		// A kernel-reported version hardlink must prove the same retained vendor vnode.
		// No path scanning, private-path exception, or arbitrary mapped-library fallback.
		if (!VERSION.test(basename(imagePath))) refuse();
		trusted = await trustedExecutable(
			ctx,
			join(ctx.home, ".local/share/claude/versions", basename(imagePath)),
		);
	}
	const canonicalFile = await ctx.io.executableFile(trusted.executable);
	if (
		!sameImageFile(imageFile, canonicalFile) ||
		canonicalFile.uid !== trusted.file.uid ||
		canonicalFile.mode !== trusted.file.mode ||
		canonicalFile.ino !== trusted.file.ino ||
		canonicalFile.dev !== trusted.file.dev
	)
		refuse();
	return { ...trusted, imagePath, imageFile, canonicalFile };
}

async function observeMac(
	ctx: Context,
	pid: number,
	allowUnresolvedAttach = false,
) {
	const before = (await processTable(ctx, pid)).get(pid);
	if (!before || !active(before)) refuse();
	const { executable, file, imagePath, imageFile, canonicalFile } =
		await macMainImage(ctx, pid);
	const command = (
		await run(ctx, "/bin/ps", ["-ww", "-p", String(pid), "-o", "command="])
	).replace(/\n$/, "");
	if (!command || hasControl(command)) refuse();
	const args = attachmentArgs(
		command,
		executable,
		[before.command],
		allowUnresolvedAttach,
	);
	const config = macEnvironment(
		command,
		await run(ctx, "/bin/ps", [
			"-E",
			"-ww",
			"-p",
			String(pid),
			"-o",
			"command=",
		]),
		ctx,
	);
	check(ctx.signal);
	const mapped = await ctx.io.run(
		"/usr/sbin/lsof",
		["-nP", "-a", "-p", String(pid), "-d", "cwd,txt", "-F0pufnDi"],
		{ signal: ctx.signal, timeout: 1500, maxBuffer: MAX_BYTES },
	);
	check(ctx.signal);
	if (Buffer.byteLength(mapped) > MAX_BYTES) refuse();
	let owner: number | undefined;
	let observedPid: number | undefined;
	const files: { fd: string; name?: string; ino?: number; dev?: number }[] = [];
	for (const raw of mapped.split("\0")) {
		const field = raw.replace(/^\n/, "");
		if (!field) continue;
		const key = field[0];
		const value = field.slice(1);
		const current = files.at(-1);
		if (key === "p" && observedPid === undefined) observedPid = Number(value);
		else if (key === "u" && owner === undefined) owner = Number(value);
		else if (key === "f") files.push({ fd: value });
		else if (key === "n" && current && current.name === undefined)
			current.name = value;
		else if (
			key === "i" &&
			current &&
			current.ino === undefined &&
			/^\d+$/.test(value)
		)
			current.ino = Number(value);
		else if (
			key === "D" &&
			current &&
			current.dev === undefined &&
			/^(?:0x)?[a-fA-F0-9]+$/.test(value)
		)
			current.dev = Number.parseInt(value, 16);
		else refuse();
	}
	const cwdRows = files.filter((item) => item.fd === "cwd");
	const cwdRow = cwdRows[0];
	if (
		observedPid !== pid ||
		owner !== ctx.uid ||
		cwdRows.length !== 1 ||
		!cwdRow
	)
		refuse();
	const cwd = await canonicalDirectory(ctx, cwdRow.name ?? "");
	const texts = files.filter(
		(item) =>
			item.fd === "txt" &&
			(item.name === executable || item.name === imagePath),
	);
	const text = texts[0];
	if (
		texts.length !== 1 ||
		!text ||
		text.ino !== file.ino ||
		text.dev !== file.dev
	)
		refuse();
	const configDir = await canonicalDirectory(ctx, config);
	const afterImagePath = await ctx.io.mainImagePath(pid);
	if (
		(afterImagePath !== imagePath && afterImagePath !== executable) ||
		(await ctx.io.realpath(imagePath)) !== imagePath ||
		(await ctx.io.realpath(executable)) !== executable ||
		!sameImageFile(imageFile, await ctx.io.executableFile(imagePath)) ||
		!sameImageFile(canonicalFile, await ctx.io.executableFile(executable))
	)
		refuse();
	const after = (await processTable(ctx, pid)).get(pid);
	if (
		!sameProcess(before, after) ||
		!after ||
		!active(after) ||
		after.command !== before.command
	)
		refuse();
	return { ...incarnation(before), executable, cwd, configDir, args };
}

function incarnation(row: NativeProcessIncarnation): NativeProcessIncarnation {
	return {
		pid: row.pid,
		parentPid: row.parentPid,
		birth: row.birth,
		uid: row.uid,
	};
}

async function linuxHeader(ctx: Context, pid: number) {
	const raw = (await ctx.io.read(`/proc/${pid}/stat`, ctx.signal)).toString(
		"utf8",
	);
	const end = raw.lastIndexOf(") ");
	if (end < 0 || !raw.startsWith(`${pid} (`)) refuse();
	const fields = raw
		.slice(end + 2)
		.trim()
		.split(/\s+/);
	const state = fields[0];
	const parent = fields[1];
	const birth = fields[19];
	if (
		!state ||
		!parent ||
		!birth ||
		!/^[RSDI]$/.test(state) ||
		!/^\d+$/.test(parent) ||
		!/^\d+$/.test(birth)
	)
		refuse();
	const status = (
		await ctx.io.read(`/proc/${pid}/status`, ctx.signal)
	).toString("utf8");
	const ids = /^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/m.exec(status);
	if (!ids || ids.slice(1).some((id) => Number(id) !== ctx.uid)) refuse();
	const directory = await ctx.io.stat(`/proc/${pid}`);
	if (directory.uid !== ctx.uid || !directory.isDirectory()) refuse();
	return {
		pid,
		parentPid: Number(parent),
		uid: ctx.uid,
		birth: `proc-start:${birth}`,
	};
}

async function observeLinux(
	ctx: Context,
	pid: number,
	allowUnresolvedAttach = false,
) {
	const before = await linuxHeader(ctx, pid);
	const { executable } = await trustedExecutable(
		ctx,
		await ctx.io.readlink(`/proc/${pid}/exe`),
	);
	const rawArgs = (
		await ctx.io.read(`/proc/${pid}/cmdline`, ctx.signal)
	).toString("utf8");
	if (!rawArgs.endsWith("\0")) refuse();
	const argv = rawArgs.slice(0, -1).split("\0");
	if (!argv[0] || argv.some((arg) => hasControl(arg))) refuse();
	let args: string[] = [];
	if (argv[1] === "attach") {
		const id = argv[2];
		if (argv.length !== 3 || !id || !BACKGROUND_ID.test(id)) {
			if (!allowUnresolvedAttach) refuse();
		} else args = ["attach", id];
	}
	const rawEnvironment = (
		await ctx.io.read(`/proc/${pid}/environ`, ctx.signal)
	).toString("utf8");
	if (!rawEnvironment.endsWith("\0")) refuse();
	const entries: [string, string][] = rawEnvironment
		.slice(0, -1)
		.split("\0")
		.map((entry) => {
			const split = entry.indexOf("=");
			if (split < 1) refuse();
			return [entry.slice(0, split), entry.slice(split + 1)];
		});
	const configDir = await canonicalDirectory(
		ctx,
		environmentProfile(entries, ctx),
	);
	const cwd = await canonicalDirectory(
		ctx,
		await ctx.io.readlink(`/proc/${pid}/cwd`),
	);
	check(ctx.signal);
	if (!sameProcess(before, await linuxHeader(ctx, pid))) refuse();
	check(ctx.signal);
	return { ...before, executable, cwd, configDir, args };
}

async function observe(
	ctx: Context,
	pid: number,
	allowUnresolvedAttach = false,
) {
	if (!validPid(pid)) refuse();
	return ctx.platform === "darwin"
		? observeMac(ctx, pid, allowUnresolvedAttach)
		: observeLinux(ctx, pid, allowUnresolvedAttach);
}

export async function observeNativeClaudeProcess(
	pid: number,
	options: NativeClaudeProcessOptions = {},
): Promise<NativeClaudeProcess> {
	try {
		return await observe(await context(options), pid);
	} catch {
		return refuse();
	}
}

export async function resolveTrustedNativeClaudeExecutable(
	path: string,
	options: NativeClaudeProcessOptions = {},
): Promise<string> {
	try {
		return (await trustedExecutable(await context(options), path)).executable;
	} catch {
		return refuse();
	}
}

export async function findNativeClaudeTerminalClient(
	rootPid: number,
	options: NativeClaudeProcessOptions = {},
): Promise<NativeClaudeTerminalClient | null> {
	try {
		if (!validPid(rootPid)) refuse();
		const ctx = await context(options);
		const table = await processTable(ctx);
		const root = table.get(rootPid);
		if (!root || !active(root)) refuse();
		const descendants = new Set([rootPid]);
		for (let depth = 0; depth < MAX_DEPTH; depth++) {
			const previous = descendants.size;
			for (const row of table.values()) {
				if (descendants.has(row.parentPid)) descendants.add(row.pid);
			}
			if (descendants.size > MAX_DESCENDANTS) refuse();
			if (previous === descendants.size) break;
			if (depth === MAX_DEPTH - 1) refuse();
		}
		const clients: NativeClaudeProcess[] = [];
		for (const pid of descendants) {
			if (pid === rootPid) continue;
			const command = table.get(pid)?.command ?? "";
			if (basename(command) !== "claude" && !VERSION.test(basename(command)))
				continue;
			const observed = await observe(ctx, pid, true);
			clients.push(observed);
		}
		if (clients.length > 1) refuse();
		if (!clients[0]) return null;
		const client = clients[0];
		const ancestors: NativeProcessIncarnation[] = [];
		let next = table.get(client.pid)?.parentPid;
		for (let depth = 0; next !== undefined && depth < MAX_DEPTH; depth++) {
			const ancestor = table.get(next);
			if (!ancestor || ancestors.some((item) => item.pid === next)) refuse();
			ancestors.push(incarnation(ancestor));
			if (next === rootPid) break;
			next = ancestor.parentPid;
		}
		if (ancestors.at(-1)?.pid !== rootPid) refuse();
		const after = await processTable(ctx);
		for (const old of [table.get(client.pid), ...ancestors]) {
			const current = old && after.get(old.pid);
			if (!old || !current || !active(current) || !sameProcess(old, current))
				refuse();
		}
		if (after.get(client.pid)?.command !== table.get(client.pid)?.command)
			refuse();
		return { ...client, ancestors };
	} catch {
		return refuse();
	}
}

export async function findNativeClaudeAttachClient(
	rootPid: number,
	options: NativeClaudeProcessOptions = {},
): Promise<NativeClaudeAttachClient | null> {
	const client = await findNativeClaudeTerminalClient(rootPid, options);
	if (!client) return null;
	// A live Claude client can rewrite argv or switch views. These arguments
	// describe launch intent, not the currently selected conversation.
	const backgroundId = client.args[1];
	if (
		client.args[0] !== "attach" ||
		!backgroundId ||
		!BACKGROUND_ID.test(backgroundId)
	)
		return refuse();
	return { ...client, backgroundId };
}
