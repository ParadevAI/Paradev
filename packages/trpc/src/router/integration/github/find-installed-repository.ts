import { db } from "@superset/db/client";
import { githubRepositories } from "@superset/db/schema";
import { and, inArray, sql } from "drizzle-orm";
import { userError } from "../../../trpc";
import { visibleGithubInstallations } from "./personal-installation";

export async function findInstalledRepository(
	organizationId: string,
	repoFullName: string,
	userId?: string,
) {
	const installations = await visibleGithubInstallations({
		organizationId,
		userId,
	});
	if (installations.length === 0)
		throw userError({
			code: "PRECONDITION_FAILED",
			message: "GitHub installation not found",
			i18nKey: "serverError.integration.githubInstallationNotFound",
		});
	const repo = await db.query.githubRepositories.findFirst({
		where: and(
			inArray(
				githubRepositories.installationId,
				installations.map((row) => row.id),
			),
			sql`lower(${githubRepositories.fullName}) = ${repoFullName.toLowerCase()}`,
		),
		columns: { id: true, fullName: true, installationId: true },
	});
	const installation = repo
		? installations.find((row) => row.id === repo.installationId)
		: undefined;
	if (!repo || !installation)
		throw userError({
			code: "NOT_FOUND",
			message: `${repoFullName} is not a repository the GitHub App is installed on`,
			i18nKey: "serverError.integration.repositoryNotInstalled",
			params: { repoFullName },
		});
	return {
		installation,
		repo: { id: repo.id, fullName: repo.fullName },
	};
}
