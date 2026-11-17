import { TRPCError } from "@trpc/server";
import { isAPIError } from "better-auth/api";

const TRPC_CODE_BY_STATUS: Record<number, TRPCError["code"]> = {
	400: "BAD_REQUEST",
	401: "UNAUTHORIZED",
	403: "FORBIDDEN",
	404: "NOT_FOUND",
	409: "CONFLICT",
	412: "PRECONDITION_FAILED",
	413: "PAYLOAD_TOO_LARGE",
	422: "UNPROCESSABLE_CONTENT",
	429: "TOO_MANY_REQUESTS",
};

export function toAuthUserError(error: unknown): unknown {
	if (!isAPIError(error) || error.statusCode < 400 || error.statusCode >= 500) {
		return error;
	}
	return new TRPCError({
		code: TRPC_CODE_BY_STATUS[error.statusCode] ?? "BAD_REQUEST",
		message: error.message,
		cause: error,
	});
}

export async function withAuthUserErrors<T>(call: Promise<T>): Promise<T> {
	try {
		return await call;
	} catch (error) {
		throw toAuthUserError(error);
	}
}
