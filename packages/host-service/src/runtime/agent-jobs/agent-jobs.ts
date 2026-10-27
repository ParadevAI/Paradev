import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import {
	closeSync,
	existsSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	readSync,
	statSync,
	writeFileSync,
	writeSync,
} from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
	type AgentJobMeta,
	type AgentJobStatus,
	formatJobFooter,
	formatJobHeader,
	JOB_LOG_FIELD_WIDTHS,
} from "./jobLog";

const ACTIVITY_INTERVAL_MS = 60_000;
const RUNNING_FOR_INTERVAL_MS = 5_000;
const KILL_GRACE_MS = 3_000;
const MAX_CHUNK_BYTES = 256 * 1024;
const DEFAULT_MAX_RUNTIME_MS = 6 * 60 * 60 * 1000;
const RETENTION_MS = 24 * 60 * 60 * 1000;

export interface StartJobInput {
	callId: string;
	sessionId: string;
	workspaceId: string;
	cwd: string;
	command: string;
	description?: string;
	maxRuntimeMs?: number;
}

export interface JobOutput {
	jobId: string;
	status: AgentJobStatus;
	chunk: string;
	nextOffset: number;
	exitCode: number | null;
	matched: boolean;
	logPath: string;
}

interface LiveJob {
	meta: AgentJobMeta;
	child: ChildProcess;
	fd: number;
	headerBytes: number;
	bodyBytes: number;
	statusAt: number;
	runningForAt: number;
	timers: NodeJS.Timeout[];
	changed: EventEmitter;
}

export interface AgentJobRunnerOptions {
	rootDir: string;
	onActivity: (workspaceId: string) => void;
	onFinish?: (meta: AgentJobMeta) => void;
	now?: () => number;
}

export class AgentJobNotFoundError extends Error {
	constructor(jobId: string) {
		super(`Agent job not found: ${jobId}`);
		this.name = "AgentJobNotFoundError";
	}
}

export function jobIdForCall(callId: string): string {
	return `j_${createHash("sha256").update(callId).digest("hex").slice(0, 20)}`;
}

export class AgentJobRunner {
	private readonly live = new Map<string, LiveJob>();
	private readonly now: () => number;

	constructor(private readonly options: AgentJobRunnerOptions) {
		this.now = options.now ?? Date.now;
		mkdirSync(options.rootDir, { recursive: true });
		this.markInterruptedJobsLost();
		void this.sweep();
	}

	start(input: StartJobInput): AgentJobMeta {
		const jobId = jobIdForCall(input.callId);
		const existing =
			this.live.get(jobId)?.meta ?? this.readMeta(input.sessionId, jobId);
		if (existing) return existing;

		const dir = join(this.options.rootDir, safeSegment(input.sessionId));
		mkdirSync(dir, { recursive: true });
		const logPath = join(dir, `${jobId}.log`);
		const meta: AgentJobMeta = {
			jobId,
			callId: input.callId,
			sessionId: input.sessionId,
			workspaceId: input.workspaceId,
			cwd: input.cwd,
			command: input.command,
			description: input.description ?? null,
			pid: null,
			status: "running",
			exitCode: null,
			startedAt: new Date(this.now()).toISOString(),
			endedAt: null,
			bodyBytes: 0,
			logPath,
		};

		const child = spawn("bash", ["-c", input.command], {
			cwd: input.cwd,
			env: process.env,
			detached: true,
			stdio: ["ignore", "pipe", "pipe"],
		});
		meta.pid = child.pid ?? null;

		const header = formatJobHeader(meta, 0);
		const fd = openSync(logPath, "w+");
		writeSync(fd, header.text, 0);
		this.writeMeta(meta);

		const job: LiveJob = {
			meta,
			child,
			fd,
			headerBytes: Buffer.byteLength(header.text),
			bodyBytes: 0,
			statusAt: header.statusAt,
			runningForAt: header.runningForAt,
			timers: [],
			changed: new EventEmitter(),
		};
		job.changed.setMaxListeners(0);
		this.live.set(jobId, job);

		const append = (data: Buffer) => {
			writeSync(job.fd, data, 0, data.length, job.headerBytes + job.bodyBytes);
			job.bodyBytes += data.length;
			job.changed.emit("change");
		};
		child.stdout?.on("data", append);
		child.stderr?.on("data", append);
		child.on("error", (error) => {
			append(Buffer.from(`${error.message}\n`));
			this.finish(job, "failed", null);
		});
		child.on("close", (code, signal) => {
			if (job.meta.status !== "running") return;
			if (signal) this.finish(job, "killed", null);
			else this.finish(job, code === 0 ? "done" : "failed", code);
		});

		this.options.onActivity(input.workspaceId);
		job.timers.push(
			setInterval(
				() => this.options.onActivity(input.workspaceId),
				ACTIVITY_INTERVAL_MS,
			),
			setInterval(() => this.writeRunningFor(job), RUNNING_FOR_INTERVAL_MS),
			setTimeout(
				() => this.kill(jobId, "timed_out"),
				input.maxRuntimeMs ?? DEFAULT_MAX_RUNTIME_MS,
			),
		);
		for (const timer of job.timers) timer.unref();
		return meta;
	}

	get(sessionId: string, jobId: string): AgentJobMeta {
		const meta = this.live.get(jobId)?.meta ?? this.readMeta(sessionId, jobId);
		if (!meta) throw new AgentJobNotFoundError(jobId);
		return meta;
	}

	async output(input: {
		sessionId: string;
		jobId: string;
		fromOffset: number;
		waitMs: number;
		pattern?: string;
	}): Promise<JobOutput> {
		const regex = input.pattern ? new RegExp(input.pattern, "m") : null;
		const live = this.live.get(input.jobId);
		const ready = () => {
			const meta = this.get(input.sessionId, input.jobId);
			if (meta.status !== "running") return true;
			const bodyBytes = live?.bodyBytes ?? meta.bodyBytes;
			if (regex) return regex.test(this.readBody(meta, 0, bodyBytes));
			return bodyBytes > input.fromOffset;
		};

		if (live && !ready() && input.waitMs > 0) {
			await new Promise<void>((resolve) => {
				const done = () => {
					if (!ready()) return;
					cleanup();
				};
				const cleanup = () => {
					clearTimeout(timer);
					live.changed.off("change", done);
					resolve();
				};
				const timer = setTimeout(cleanup, input.waitMs);
				live.changed.on("change", done);
			});
		}

		const meta = this.get(input.sessionId, input.jobId);
		const bodyBytes = this.live.get(input.jobId)?.bodyBytes ?? meta.bodyBytes;
		const end = Math.min(bodyBytes, input.fromOffset + MAX_CHUNK_BYTES);
		const chunk = this.readBody(meta, input.fromOffset, end);
		return {
			jobId: meta.jobId,
			status: meta.status,
			chunk,
			nextOffset: Math.max(input.fromOffset, end),
			exitCode: meta.exitCode,
			matched: regex ? regex.test(this.readBody(meta, 0, bodyBytes)) : false,
			logPath: meta.logPath,
		};
	}

	kill(jobId: string, status: AgentJobStatus = "killed"): void {
		const job = this.live.get(jobId);
		if (!job || job.meta.status !== "running") return;
		const pid = job.child.pid;
		this.finish(job, status, null);
		if (pid === undefined) return;
		signalGroup(pid, "SIGTERM");
		setTimeout(() => signalGroup(pid, "SIGKILL"), KILL_GRACE_MS).unref();
	}

	async sweep(): Promise<void> {
		const cutoff = this.now() - RETENTION_MS;
		for (const session of safeReaddir(this.options.rootDir)) {
			const dir = join(this.options.rootDir, session);
			for (const file of safeReaddir(dir)) {
				if (!file.endsWith(".json")) continue;
				const meta = readJson(join(dir, file));
				if (!meta || meta.status === "running" || !meta.endedAt) continue;
				if (Date.parse(meta.endedAt) > cutoff) continue;
				await rm(join(dir, file), { force: true });
				await rm(meta.logPath, { force: true });
			}
			if (safeReaddir(dir).length === 0)
				await rm(dir, { recursive: true, force: true });
		}
	}

	stopAll(): void {
		for (const jobId of [...this.live.keys()]) this.kill(jobId);
	}

	private finish(
		job: LiveJob,
		status: AgentJobStatus,
		exitCode: number | null,
	) {
		if (job.meta.status !== "running") return;
		for (const timer of job.timers) clearInterval(timer);
		const endedAt = this.now();
		job.meta.status = status;
		job.meta.exitCode = exitCode;
		job.meta.endedAt = new Date(endedAt).toISOString();
		job.meta.bodyBytes = job.bodyBytes;
		this.writeRunningFor(job);
		writeSync(job.fd, padStatus(status), job.statusAt);
		const footer = formatJobFooter(
			exitCode,
			endedAt - Date.parse(job.meta.startedAt),
		);
		writeSync(job.fd, footer, job.headerBytes + job.bodyBytes);
		closeSync(job.fd);
		this.writeMeta(job.meta);
		this.live.delete(job.meta.jobId);
		job.changed.emit("change");
		this.options.onFinish?.(job.meta);
	}

	private writeRunningFor(job: LiveJob) {
		const runningFor = this.now() - Date.parse(job.meta.startedAt);
		const value = String(runningFor).padEnd(JOB_LOG_FIELD_WIDTHS.runningForMs);
		writeSync(job.fd, value, job.runningForAt);
	}

	private readBody(meta: AgentJobMeta, from: number, to: number): string {
		if (to <= from || !existsSync(meta.logPath)) return "";
		const headerBytes = this.headerBytesOf(meta);
		const fd = openSync(meta.logPath, "r");
		try {
			const buffer = Buffer.alloc(to - from);
			const read = readSync(fd, buffer, 0, buffer.length, headerBytes + from);
			return buffer.subarray(0, read).toString("utf8");
		} finally {
			closeSync(fd);
		}
	}

	private headerBytesOf(meta: AgentJobMeta): number {
		const live = this.live.get(meta.jobId);
		if (live) return live.headerBytes;
		return Buffer.byteLength(formatJobHeader(meta, 0).text);
	}

	private markInterruptedJobsLost(): void {
		for (const session of safeReaddir(this.options.rootDir)) {
			const dir = join(this.options.rootDir, session);
			for (const file of safeReaddir(dir)) {
				if (!file.endsWith(".json")) continue;
				const meta = readJson(join(dir, file));
				if (!meta || meta.status !== "running") continue;
				meta.status = "lost";
				meta.endedAt = new Date(this.now()).toISOString();
				if (existsSync(meta.logPath)) {
					const header = formatJobHeader(meta, 0);
					meta.bodyBytes = Math.max(
						0,
						statSync(meta.logPath).size - Buffer.byteLength(header.text),
					);
					const fd = openSync(meta.logPath, "r+");
					writeSync(fd, padStatus("lost"), header.statusAt);
					closeSync(fd);
				}
				this.writeMeta(meta);
			}
		}
	}

	private metaPath(sessionId: string, jobId: string): string {
		return join(this.options.rootDir, safeSegment(sessionId), `${jobId}.json`);
	}

	private readMeta(sessionId: string, jobId: string): AgentJobMeta | null {
		return readJson(this.metaPath(sessionId, jobId));
	}

	private writeMeta(meta: AgentJobMeta): void {
		writeFileSync(
			this.metaPath(meta.sessionId, meta.jobId),
			JSON.stringify(meta),
		);
	}
}

function padStatus(status: AgentJobStatus): string {
	return status.padEnd(JOB_LOG_FIELD_WIDTHS.status);
}

function signalGroup(pid: number, signal: NodeJS.Signals): void {
	try {
		process.kill(-pid, signal);
	} catch {}
}

function safeSegment(value: string): string {
	return value.replace(/[^A-Za-z0-9_-]/g, "_");
}

function safeReaddir(dir: string): string[] {
	try {
		return readdirSync(dir);
	} catch {
		return [];
	}
}

function readJson(path: string): AgentJobMeta | null {
	try {
		return JSON.parse(readFileSync(path, "utf8")) as AgentJobMeta;
	} catch {
		return null;
	}
}
