interface HttpErrorShape {
	data?: { httpStatus?: number } | null;
	meta?: { response?: { status?: number } };
}

/** A host that does not serve chat answers 404; that host has no chats, it did not fail. */
export function isMissingEndpoint(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	const shape = error as HttpErrorShape;
	return shape.data?.httpStatus === 404 || shape.meta?.response?.status === 404;
}
