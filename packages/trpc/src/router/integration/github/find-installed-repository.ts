import { db } from "@superset/db/client";
import { githubInstallations, githubRepositories } from "@superset/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { userError } from "../../../trpc";

export async function findInstalledRepository(
	organizationId: string,
	repoFullName: string,
) {
	const repo = await db.query.githubRepositories.findFirst({
		where: and(
			eq(githubRepositories.organizationId, organizationId),
			sql`lower(${githubRepositories.fullName}) = ${repoFullName.toLowerCase()}`,
		),
		columns: { id: true, fullName: true },
		with: { installation: true },
	});
	if (repo) {
		const { installation, ...rest } = repo;
		return { installation, repo: rest };
	}
	const anyInstallation = await db.query.githubInstallations.findFirst({
		where: eq(githubInstallations.organizationId, organizationId),
		columns: { id: true },
	});
	if (!anyInstallation)
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
