export type RepositorySource =
	| { kind: "local"; path: string }
	| { kind: "clone"; url: string };

const URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const SCP_PATTERN = /^[\w.-]+@[\w.-]+:/;

/** A URL (or `user@host:path`) is cloned; anything else is a local path. */
export function repositorySource(value: string): RepositorySource {
	return URL_PATTERN.test(value) || SCP_PATTERN.test(value)
		? { kind: "clone", url: value }
		: { kind: "local", path: value };
}
