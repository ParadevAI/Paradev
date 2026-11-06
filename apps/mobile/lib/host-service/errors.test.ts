import { describe, expect, test } from "bun:test";
import { TRPCClientError } from "@trpc/client";
import { isMissingProcedureError } from "./errors";

describe("isMissingProcedureError", () => {
	test("matches only a tRPC client error for a missing path", () => {
		const message = 'No procedure found on path "chat.steerSubagent"';
		expect(isMissingProcedureError(new TRPCClientError(message))).toBe(true);
		expect(isMissingProcedureError(new Error(message))).toBe(false);
		expect(
			isMissingProcedureError(
				new TRPCClientError("Procedure chat.x not found on server"),
			),
		).toBe(false);
	});
});
