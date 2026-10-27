export type HostJobStatus =
	| "running"
	| "done"
	| "failed"
	| "killed"
	| "timed_out"
	| "lost";

export interface HostJobOutput {
	jobId: string;
	status: HostJobStatus;
	chunk: string;
	nextOffset: number;
	exitCode: number | null;
	matched: boolean;
	logPath: string;
}

/** The host-service `agentJobs` router, as the worker calls it. */
export interface HostJobs {
	exec(input: {
		callId: string;
		sessionId: string;
		workspaceId: string;
		command: string;
		description?: string;
		maxRuntimeMs?: number;
	}): Promise<{
		jobId: string;
		status: HostJobStatus;
		pid: number | null;
		logPath: string;
	}>;
	output(input: {
		sessionId: string;
		jobId: string;
		fromOffset: number;
		waitMs: number;
		pattern?: string;
	}): Promise<HostJobOutput>;
	kill(input: {
		sessionId: string;
		jobId: string;
	}): Promise<{ status: HostJobStatus }>;
	readFile(input: {
		path: string;
		maxBytes?: number;
	}): Promise<{ base64: string; size: number }>;
	writeFile(input: {
		path: string;
		base64: string;
		createParents?: boolean;
	}): Promise<{ size: number }>;
	mkdir(input: { path: string }): Promise<{ ok: true }>;
	stat(input: { path: string }): Promise<
		| { exists: false }
		| {
				exists: true;
				isFile: boolean;
				isDirectory: boolean;
				size: number;
				mtimeMs: number;
		  }
	>;
	readdir(input: {
		path: string;
	}): Promise<Array<{ name: string; isDirectory: boolean }>>;
}

const MAX_WAIT_MS = 20_000;

export interface RunResult {
	jobId: string;
	status: HostJobStatus;
	exitCode: number | null;
	output: string;
	logPath: string;
	endOffset: number;
}

/**
 * Follows a job until it ends, `deadlineMs` passes, `pattern` matches, or `signal`
 * aborts. The job keeps running in the last three cases.
 */
export async function followJob(
	host: HostJobs,
	input: {
		sessionId: string;
		jobId: string;
		fromOffset?: number;
		deadlineMs: number;
		pattern?: string;
		signal?: AbortSignal;
		onData?: (chunk: string) => void;
		now?: () => number;
	},
): Promise<RunResult & { matched: boolean }> {
	const now = input.now ?? Date.now;
	let offset = input.fromOffset ?? 0;
	let output = "";
	for (;;) {
		if (input.signal?.aborted) throw new Error("Operation aborted");
		const waitMs = Math.max(0, Math.min(MAX_WAIT_MS, input.deadlineMs - now()));
		const out = await untilAborted(
			host.output({
				sessionId: input.sessionId,
				jobId: input.jobId,
				fromOffset: offset,
				waitMs,
				...(input.pattern ? { pattern: input.pattern } : {}),
			}),
			input.signal,
		);
		if (out.chunk) {
			output += out.chunk;
			input.onData?.(out.chunk);
		}
		offset = out.nextOffset;
		const done =
			out.status !== "running" || out.matched || now() >= input.deadlineMs;
		if (done && out.chunk.length === 0) {
			return {
				jobId: out.jobId,
				status: out.status,
				exitCode: out.exitCode,
				output,
				logPath: out.logPath,
				endOffset: offset,
				matched: out.matched,
			};
		}
	}
}

function untilAborted<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
	if (!signal) return work;
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(new Error("Operation aborted"));
		if (signal.aborted) return onAbort();
		signal.addEventListener("abort", onAbort, { once: true });
		work
			.then(resolve, reject)
			.finally(() => signal.removeEventListener("abort", onAbort));
	});
}

export function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}
