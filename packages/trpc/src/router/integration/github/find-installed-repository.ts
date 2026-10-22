import { db } from "@superset/db/client";
import { githubInstallations, githubRepositories } from "@superset/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { userError } from "../../../trpc";

export async function findInstalledRepository(
	organizationId: string,
	repoFullName: string,
) {
	const repo = await db.query.githubRepositories.findFirst({
		where: and(
			eq(githubRepositories.organizationId, organizationId),
			isNull(githubRepositories.disconnectedAt),
			sql`lower(${githubRepositories.fullName}) = ${repoFullName.toLowerCase()}`,
		),
		columns: { id: true, fullName: true, installationId: true },
	});
	const installation = repo?.installationId
		? await db.query.githubInstallations.findFirst({
				where: eq(githubInstallations.id, repo.installationId),
			})
		: undefined;
	if (!repo || !installation) {
		const any = await db.query.githubInstallations.findFirst({
			where: eq(githubInstallations.organizationId, organizationId),
			columns: { id: true },
		});
		if (!any)
			throw userError({
				code: "PRECONDITION_FAILED",
				message: "GitHub installation not found",
				i18nKey: "serverError.integration.githubInstallationNotFound",
			});
		throw userError({
			code: "NOT_FOUND",
			message: `${repoFullName} is not a repository the GitHub App is installed on`,
			i18nKey: "serverError.integration.repositoryNotInstalled",
			params: { repoFullName },
		});
	}
	return { installation, repo: { id: repo.id, fullName: repo.fullName } };
}
