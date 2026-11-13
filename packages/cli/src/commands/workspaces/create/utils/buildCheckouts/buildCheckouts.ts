import { CLIError } from "@superset/cli-framework";

export interface ProjectRepository {
	id: string;
	name: string;
}

export interface CheckoutRequest {
	baseBranch?: string;
	pr?: number;
}

interface FlagValue {
	repository: ProjectRepository;
	value: string;
}

/**
 * `<repository>=<value>` names a repository by name or id; a bare value is
 * only allowed when the project has one repository.
 */
function resolveFlagValues(
	flag: string,
	values: string[],
	repositories: ProjectRepository[],
): FlagValue[] {
	const seen = new Set<string>();
	return values.map((raw) => {
		const separator = raw.indexOf("=");
		const prefix = separator > 0 ? raw.slice(0, separator) : null;
		const named = prefix
			? repositories.find(
					(r) =>
						r.id === prefix || r.name.toLowerCase() === prefix.toLowerCase(),
				)
			: undefined;
		// Git allows `=` in branch names, so with one repository an unknown prefix is part of the value.
		const key = named || repositories.length !== 1 ? prefix : null;
		const value = key ? raw.slice(separator + 1) : raw;
		const repository = key
			? named
			: repositories.length === 1
				? repositories[0]
				: undefined;
		if (!repository) {
			const names = repositories.map((r) => r.name).join(", ");
			throw key
				? new CLIError(
						`${flag}: the project has no repository "${key}"`,
						`Use one of: ${names}`,
					)
				: new CLIError(
						`${flag} needs a repository: this project has several`,
						`Use ${flag} <repository>=<value>, where <repository> is one of: ${names}`,
					);
		}
		if (seen.has(repository.id)) {
			throw new CLIError(`${flag} is given twice for ${repository.name}`);
		}
		seen.add(repository.id);
		if (!value) throw new CLIError(`${flag} ${raw}: the value is empty`);
		return { repository, value };
	});
}

/** The host's `checkouts` input from repeatable --pr and --base-branch. */
export function buildCheckouts(args: {
	repositories: ProjectRepository[];
	pr?: string[];
	baseBranch?: string[];
}): Record<string, CheckoutRequest> | undefined {
	const checkouts: Record<string, CheckoutRequest> = {};
	for (const { repository, value } of resolveFlagValues(
		"--pr",
		args.pr ?? [],
		args.repositories,
	)) {
		const pr = /^\d+$/.test(value) ? Number(value) : 0;
		if (pr <= 0) {
			throw new CLIError(`--pr ${value}: not a pull request number`);
		}
		checkouts[repository.id] = { ...checkouts[repository.id], pr };
	}
	for (const { repository, value } of resolveFlagValues(
		"--base-branch",
		args.baseBranch ?? [],
		args.repositories,
	)) {
		checkouts[repository.id] = {
			...checkouts[repository.id],
			baseBranch: value,
		};
	}
	return Object.keys(checkouts).length > 0 ? checkouts : undefined;
}
