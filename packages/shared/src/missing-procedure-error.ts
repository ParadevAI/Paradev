export function isMissingProcedureError(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const message = (error as { message?: unknown }).message;
	return (
		typeof message === "string" &&
		/no procedure found|procedure .* not found on server/i.test(message)
	);
}
