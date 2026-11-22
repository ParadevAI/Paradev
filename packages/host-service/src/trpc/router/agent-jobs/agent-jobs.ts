import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, normalize } from "node:path";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	AgentJobNotFoundError,
	type AgentJobRunner,
} from "../../../runtime/agent-jobs";
import { WorkspaceNotFoundError } from "../../../runtime/filesystem/filesystem";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";

const MAX_WAIT_MS = 20_000;
const MAX_READ_BYTES = 25 * 1024 * 1024;

function runnerOf(ctx: HostServiceContext): AgentJobRunner {
	const runner = ctx.runtime.agentJobs;
	if (!runner) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Agent jobs are not available on this host.",
		});
	}
	return runner;
}

function workspaceRoot(ctx: HostServiceContext, workspaceId: string): string {
	try {
		return ctx.runtime.filesystem.resolveWorkspaceRoot(workspaceId);
	} catch (error) {
		if (error instanceof WorkspaceNotFoundError) {
			throw new TRPCError({ code: "NOT_FOUND", message: error.message });
		}
		throw error;
	}
}

function absolutePath(input: string): string {
	const trimmed = input.trim();
	if (trimmed === "~" || trimmed.startsWith("~/")) {
		return normalize(join(homedir(), trimmed.slice(1)));
	}
	if (!isAbsolute(trimmed)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Path must be absolute.",
		});
	}
	return normalize(trimmed);
}

async function withJob<T>(fn: () => Promise<T> | T): Promise<T> {
	try {
		return await fn();
	} catch (error) {
		if (error instanceof AgentJobNotFoundError) {
			throw new TRPCError({ code: "NOT_FOUND", message: error.message });
		}
		throw error;
	}
}

async function withFs<T>(fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (error) {
		const code = (error as NodeJS.ErrnoException | null)?.code;
		if (code === "ENOENT") {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: (error as Error).message,
			});
		}
		if (code === "EISDIR" || code === "ENOTDIR") {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: (error as Error).message,
			});
		}
		if (code === "EACCES" || code === "EPERM") {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: (error as Error).message,
			});
		}
		throw error;
	}
}

const patternSchema = z
	.string()
	.max(1_000)
	.refine((value) => {
		try {
			new RegExp(value, "m");
			return true;
		} catch {
			return false;
		}
	}, "Invalid regular expression");

export const agentJobsRouter = router({
	context: protectedProcedure
		.input(z.object({ workspaceId: z.string().min(1) }))
		.mutation(({ ctx, input }) => ({
			cwd: workspaceRoot(ctx, input.workspaceId),
			homeDir: homedir(),
			platform: process.platform,
			shell: "bash",
		})),

	exec: protectedProcedure
		.input(
			z.object({
				callId: z.string().min(1).max(200),
				sessionId: z.string().min(1).max(100),
				workspaceId: z.string().min(1),
				command: z.string().min(1).max(100_000),
				description: z.string().max(500).optional(),
				maxRuntimeMs: z
					.number()
					.int()
					.positive()
					.max(24 * 60 * 60 * 1000)
					.optional(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const meta = runnerOf(ctx).start({
				...input,
				cwd: workspaceRoot(ctx, input.workspaceId),
			});
			return {
				jobId: meta.jobId,
				status: meta.status,
				pid: meta.pid,
				logPath: meta.logPath,
			};
		}),

	output: protectedProcedure
		.input(
			z.object({
				sessionId: z.string().min(1).max(100),
				jobId: z.string().min(1).max(100),
				fromOffset: z.number().int().min(0),
				waitMs: z.number().int().min(0).max(MAX_WAIT_MS),
				pattern: patternSchema.optional(),
			}),
		)
		.mutation(({ ctx, input }) => withJob(() => runnerOf(ctx).output(input))),

	kill: protectedProcedure
		.input(z.object({ sessionId: z.string().min(1), jobId: z.string().min(1) }))
		.mutation(({ ctx, input }) =>
			withJob(() => {
				const runner = runnerOf(ctx);
				runner.kill(input.jobId);
				return { status: runner.get(input.sessionId, input.jobId).status };
			}),
		),

	readFile: protectedProcedure
		.input(
			z.object({
				path: z.string().min(1),
				maxBytes: z.number().int().positive().max(MAX_READ_BYTES).optional(),
			}),
		)
		.mutation(({ input }) =>
			withFs(async () => {
				const path = absolutePath(input.path);
				const info = await stat(path);
				const limit = input.maxBytes ?? MAX_READ_BYTES;
				if (info.size > limit) {
					throw new TRPCError({
						code: "PAYLOAD_TOO_LARGE",
						message: `${path} is ${info.size} bytes, over the ${limit} byte limit.`,
					});
				}
				const bytes = await readFile(path);
				return { base64: bytes.toString("base64"), size: bytes.length };
			}),
		),

	writeFile: protectedProcedure
		.input(
			z.object({
				path: z.string().min(1),
				base64: z.string(),
				createParents: z.boolean().default(true),
			}),
		)
		.mutation(({ input }) =>
			withFs(async () => {
				const path = absolutePath(input.path);
				if (input.createParents)
					await mkdir(dirname(path), { recursive: true });
				const bytes = Buffer.from(input.base64, "base64");
				await writeFile(path, bytes);
				return { size: bytes.length };
			}),
		),

	mkdir: protectedProcedure
		.input(z.object({ path: z.string().min(1) }))
		.mutation(({ input }) =>
			withFs(async () => {
				await mkdir(absolutePath(input.path), { recursive: true });
				return { ok: true as const };
			}),
		),

	stat: protectedProcedure
		.input(z.object({ path: z.string().min(1) }))
		.mutation(async ({ input }) => {
			try {
				const info = await stat(absolutePath(input.path));
				return {
					exists: true as const,
					isFile: info.isFile(),
					isDirectory: info.isDirectory(),
					size: info.size,
					mtimeMs: info.mtimeMs,
				};
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") {
					return { exists: false as const };
				}
				throw error;
			}
		}),

	readdir: protectedProcedure
		.input(z.object({ path: z.string().min(1) }))
		.mutation(({ input }) =>
			withFs(async () => {
				const entries = await readdir(absolutePath(input.path), {
					withFileTypes: true,
				});
				return entries.map((entry) => ({
					name: entry.name,
					isDirectory: entry.isDirectory(),
				}));
			}),
		),
});
