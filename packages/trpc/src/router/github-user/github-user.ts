import type { TRPCRouterRecord } from "@trpc/server";
import {
	disconnectGithubUser,
	GithubUserConnectionError,
	githubUserAuthorizeUrl,
	githubUserConnectionConfigured,
	githubUserConnectionFor,
} from "../../lib/github-user";
import { personProcedure, userError } from "../../trpc";

/** The caller's own GitHub connection: what it is, how to start one, how to end it. */
export const githubUserRouter = {
	get: personProcedure.query(async ({ ctx }) => {
		const connection = await githubUserConnectionFor(ctx.principal.userId);
		return {
			available: githubUserConnectionConfigured(),
			connection: connection
				? { login: connection.login, name: connection.name }
				: null,
		};
	}),

	connect: personProcedure.mutation(({ ctx }) => {
		try {
			return { url: githubUserAuthorizeUrl(ctx.principal.userId) };
		} catch (error) {
			if (!(error instanceof GithubUserConnectionError)) throw error;
			throw userError({
				code: "PRECONDITION_FAILED",
				message: error.message,
				i18nKey: "serverError.githubUser.notConfigured",
			});
		}
	}),

	disconnect: personProcedure.mutation(async ({ ctx }) => {
		await disconnectGithubUser(ctx.principal.userId);
		return { disconnected: true };
	}),
} satisfies TRPCRouterRecord;
