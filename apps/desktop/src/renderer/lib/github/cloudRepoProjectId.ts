import { v5 as uuidv5 } from "uuid";

const CLOUD_REPO_PROJECT_NAMESPACE = "3f3a7f0e-6b1a-4d2c-9c0a-7e5d1b2f8a41";

/**
 * The id of the stand-in project for a GitHub repo no host has a checkout
 * of. Derived from the repo name so the sidebar's filing and the project
 * picker's choice agree without a record; `null` for rows whose repo is unknown.
 */
export function cloudRepoProjectId(repoFullName: string | null): string {
	return uuidv5(
		repoFullName?.toLowerCase() ?? "",
		CLOUD_REPO_PROJECT_NAMESPACE,
	);
}
