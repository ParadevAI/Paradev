import { describe, expect, test } from "bun:test";
import { ApiError } from "@superset/chats-sync";
import { TRPCClientError } from "@trpc/client";
import { toApiError } from "./chatsApi";

describe("toApiError", () => {
	test("an error the API answered with becomes an ApiError with its status", () => {
		const refused = new TRPCClientError("Group not found", {
			result: { error: { data: { httpStatus: 404, code: "NOT_FOUND" } } },
		} as never);
		const mapped = toApiError(refused);
		expect(mapped).toBeInstanceOf(ApiError);
		expect((mapped as ApiError).status).toBe(404);
		expect((mapped as ApiError).code).toBe("not_found");
	});

	test("a request that never reached the API stays a plain error, so it is retried", () => {
		const offline = new TypeError("Failed to fetch");
		const wrapped = new TRPCClientError("Failed to fetch", { cause: offline });
		expect(toApiError(wrapped)).toBe(offline);
		expect(toApiError(offline)).toBe(offline);
	});
});
