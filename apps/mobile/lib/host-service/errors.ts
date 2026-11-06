import { isMissingProcedureError as isMissingProcedure } from "@superset/shared/missing-procedure-error";
import { TRPCClientError } from "@trpc/client";

interface HostServiceErrorData {
	code?: string;
	deleteInProgress?: unknown;
	teardownFailure?: unknown;
}

export function isTrpcErrorWithData(
	error: unknown,
): error is { data: HostServiceErrorData } {
	return (
		error instanceof TRPCClientError &&
		typeof error.data === "object" &&
		error.data !== null
	);
}

export function isMissingProcedureError(error: unknown): boolean {
	return (
		error instanceof TRPCClientError &&
		isMissingProcedure(error) &&
		/on path/i.test(error.message)
	);
}
