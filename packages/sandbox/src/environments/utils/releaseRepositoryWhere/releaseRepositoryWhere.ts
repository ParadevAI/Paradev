import { githubRepositories } from "@superset/db/schema";
import { and, eq, sql } from "drizzle-orm";

export function releaseRepositoryWhere(
	organizationId: string,
	fullName: string,
) {
	return and(
		eq(githubRepositories.organizationId, organizationId),
		sql`lower(${githubRepositories.fullName}) = ${fullName.toLowerCase()}`,
	);
}
