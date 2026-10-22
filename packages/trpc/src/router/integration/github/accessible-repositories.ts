/**
 * The repositories a person may put in an environment: every public one the
 * organization's installations deliver, and the private ones both the App
 * and the person's own GitHub connection reach. GitHub computes that
 * intersection per installation; without a connection, public ones only.
 */
import { db } from "@superset/db/client";
import { githubInstallations } from "@superset/db/schema";
import { inArray } from "drizzle-orm";
import {
	githubUserConnectionConfigured,
	githubUserInstallationRepoIds,
	githubUserTokenFor,
} from "../../../lib/github-user";

interface Repository {
	repoId: string;
	isPrivate: boolean;
	installationId: string | null;
}

export interface AccessibleRepositories<T> {
	repositories: T[];
	/** Whether the caller's own GitHub account decided the list. */
	connected: boolean;
	/** Whether this server can connect one at all. */
	connectable: boolean;
}

export function filterReachable<
	T extends Pick<Repository, "repoId" | "isPrivate">,
>(repositories: readonly T[], reachableRepoIds: ReadonlySet<string>): T[] {
	return repositories.filter(
		(repository) =>
			!repository.isPrivate || reachableRepoIds.has(repository.repoId),
	);
}

export async function accessibleRepositories<T extends Repository>(args: {
	userId: string;
	repositories: readonly T[];
}): Promise<AccessibleRepositories<T>> {
	const connectable = githubUserConnectionConfigured();
	if (!connectable) {
		return {
			repositories: [...args.repositories],
			connected: false,
			connectable,
		};
	}
	const token = await githubUserTokenFor(args.userId);
	if (!token) {
		return {
			repositories: filterReachable(args.repositories, new Set()),
			connected: false,
			connectable,
		};
	}
	const installationIds = [
		...new Set(
			args.repositories.flatMap((repository) =>
				repository.installationId ? [repository.installationId] : [],
			),
		),
	];
	const installations = installationIds.length
		? await db.query.githubInstallations.findMany({
				where: inArray(githubInstallations.id, installationIds),
				columns: { installationId: true },
			})
		: [];
	const reachable = new Set<string>();
	for (const installation of installations) {
		try {
			for (const id of await githubUserInstallationRepoIds({
				token,
				installationId: installation.installationId,
			}))
				reachable.add(id);
		} catch (error) {
			// A lookup that fails hides that account's private repositories
			// rather than offering them unverified.
			console.warn(
				`[integration.github] repository reach for installation ${installation.installationId} failed`,
				error instanceof Error ? error.message : error,
			);
		}
	}
	return {
		repositories: filterReachable(args.repositories, reachable),
		connected: true,
		connectable,
	};
}
