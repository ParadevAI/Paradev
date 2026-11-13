/** Resend reports API and network failures in `error` instead of rejecting. */
export function throwOnResendError(result: {
	error: { name: string; message: string } | null;
}) {
	if (result.error) {
		throw new Error(`Resend ${result.error.name}: ${result.error.message}`);
	}
}
