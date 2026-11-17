import { TRPCError } from "@trpc/server";
import { isAPIError } from "better-auth/api";
import { userError } from "../../i18n-error";

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

const I18N_KEY_BY_AUTH_CODE: Record<string, string> = {
	ORGANIZATION_ALREADY_EXISTS: "serverError.organization.alreadyExists",
	YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
		"serverError.organization.onlyOwnerCannotLeave",
	MUST_BELONG_TO_A_TEAM: "serverError.team.mustBelongToATeam",
};

export function toAuthUserError(error: unknown): unknown {
	if (!isAPIError(error) || error.statusCode < 400 || error.statusCode >= 500) {
		return error;
	}
	const code = TRPC_CODE_BY_STATUS[error.statusCode] ?? "BAD_REQUEST";
	const i18nKey = I18N_KEY_BY_AUTH_CODE[String(error.body?.code ?? "")];
	if (i18nKey) return userError({ code, message: error.message, i18nKey });
	return new TRPCError({ code, message: error.message, cause: error });
}

export async function withAuthUserErrors<T>(call: Promise<T>): Promise<T> {
	try {
		return await call;
	} catch (error) {
		throw toAuthUserError(error);
	}
}
