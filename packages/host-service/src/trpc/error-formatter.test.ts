import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import type { HostServiceContext } from "../types";
import { createCallerFactory, publicProcedure, router } from "./index";
import { rethrowEnvironmentalGitError } from "./router/git/utils/classify-git-error";
import { requireProjectRepoPath } from "./router/workspace-creation/shared/local-project";

const missingRepoPath = "/nonexistent/superset-test/acme-web";

const testRouter = router({
	gitInit: publicProcedure.mutation(() => {
		rethrowEnvironmentalGitError(
			new Error(
				"xcode-select: note: No developer tools were found, requesting install.\n",
			),
		);
	}),
	branches: publicProcedure.query(() =>
		requireProjectRepoPath({ repoPath: missingRepoPath } as Parameters<
			typeof requireProjectRepoPath
		>[0]),
	),
});

describe("tRPC error formatter", () => {
	test("sends a missing project folder to the client as data.projectDirMissing", async () => {
		const caller = createCallerFactory(testRouter)(
			{} as unknown as HostServiceContext,
		);
		const error = await caller.branches().then(
			() => {
				throw new Error("expected the call to fail");
			},
			(err: TRPCError) => err,
		);
		const shape = testRouter._def._config.errorFormatter({
			shape: {
				message: error.message,
				code: -32004,
				data: { code: "NOT_FOUND", httpStatus: 404, path: "branches" },
			},
			error,
			type: "query",
			path: "branches",
			input: undefined,
			ctx: undefined,
		});
		expect(error.code).toBe("NOT_FOUND");
		expect(shape.data.projectDirMissing).toEqual({
			kind: "PROJECT_DIR_MISSING",
			repoPath: missingRepoPath,
		});
	});

	test("sends a classified git environment failure as data.gitEnvironment", async () => {
		const caller = createCallerFactory(testRouter)(
			{} as unknown as HostServiceContext,
		);
		const error = await caller.gitInit().then(
			() => {
				throw new Error("expected the call to fail");
			},
			(err: TRPCError) => err,
		);
		expect(error).toBeInstanceOf(TRPCError);
		const shape = testRouter._def._config.errorFormatter({
			shape: {
				message: error.message,
				code: -32012,
				data: {
					code: "PRECONDITION_FAILED",
					httpStatus: 412,
					path: "gitInit",
				},
			},
			error,
			type: "mutation",
			path: "gitInit",
			input: undefined,
			ctx: undefined,
		});
		expect(shape.data.gitEnvironment).toEqual({
			kind: "GIT_ENVIRONMENT",
			reason: "COMMAND_LINE_TOOLS_MISSING",
		});
	});
});
