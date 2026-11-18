import { API_KEY_ERROR_CODES } from "@better-auth/api-key";
import { isAPIError } from "better-auth/api";

const REJECTED_API_KEY_CODES = new Set<string>([
	API_KEY_ERROR_CODES.INVALID_API_KEY.code,
	API_KEY_ERROR_CODES.KEY_NOT_FOUND.code,
	API_KEY_ERROR_CODES.KEY_DISABLED.code,
	API_KEY_ERROR_CODES.KEY_EXPIRED.code,
	API_KEY_ERROR_CODES.INVALID_REFERENCE_ID_FROM_API_KEY.code,
]);

export function isRejectedApiKeyError(error: unknown): boolean {
	return (
		isAPIError(error) &&
		REJECTED_API_KEY_CODES.has(String(error.body?.code ?? ""))
	);
}

export async function nullOnRejectedApiKey<T>(
	lookup: Promise<T>,
): Promise<T | null> {
	try {
		return await lookup;
	} catch (error) {
		if (isRejectedApiKeyError(error)) return null;
		throw error;
	}
}
