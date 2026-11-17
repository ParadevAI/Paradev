import { describe, expect, test } from "bun:test";
import type { TRPCError } from "@trpc/server";
import type { HostServiceContext } from "../../../types";
import { filesystemRouter } from "./filesystem";

function callerListing(
	listDirectory: (signal: AbortSignal | undefined) => Promise<never>,
	signal: AbortSignal,
) {
	const ctx = {
		isAuthenticated: true,
		runtime: {
			filesystem: {
				getServiceForWorkspace: () => ({
					listDirectory: (
						_input: unknown,
						options?: { signal?: AbortSignal },
					) => listDirectory(options?.signal),
				}),
			},
		},
	} as unknown as HostServiceContext;
	return filesystemRouter
		.createCaller(ctx, { signal })
		.listDirectory({ workspaceId: "ws", absolutePath: "/tmp" });
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
	try {
		await promise;
	} catch (error) {
		return (error as TRPCError).code;
	}
	throw new Error("expected a rejection");
}

describe("filesystem.listDirectory abort classification", () => {
	test("a client disconnect is CLIENT_CLOSED_REQUEST", async () => {
		const controller = new AbortController();
		controller.abort("Client connection prematurely closed.");
		const code = await codeOf(
			callerListing(async (signal) => {
				signal?.throwIfAborted();
				throw new Error("unreachable");
			}, controller.signal),
		);
		expect(code).toBe("CLIENT_CLOSED_REQUEST");
	});

	test("a real failure after the abort stays INTERNAL_SERVER_ERROR", async () => {
		const controller = new AbortController();
		controller.abort("Client connection prematurely closed.");
		const code = await codeOf(
			callerListing(async () => {
				throw new Error("readdir exploded");
			}, controller.signal),
		);
		expect(code).toBe("INTERNAL_SERVER_ERROR");
	});

	test("a thrown string without an abort stays INTERNAL_SERVER_ERROR", async () => {
		const code = await codeOf(
			callerListing(async () => {
				throw "Client connection prematurely closed.";
			}, new AbortController().signal),
		);
		expect(code).toBe("INTERNAL_SERVER_ERROR");
	});
});
