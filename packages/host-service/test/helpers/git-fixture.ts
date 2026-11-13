import {
	cpSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SimpleGit } from "simple-git";
import { createUserSimpleGit } from "../../src/runtime/git/simple-git";

export interface GitFixture {
	repoPath: string;
	git: SimpleGit;
	commit: (message: string, files?: Record<string, string>) => Promise<string>;
	dispose: () => void;
}

// Resolve symlinks (e.g. macOS /var → /private/var) so paths handed to
// workspace-fs match what its realpath-based root checks see.
const makeRepoDir = () =>
	realpathSync(mkdtempSync(join(tmpdir(), "host-service-test-repo-")));

function fixtureAt(repoPath: string): GitFixture {
	const git = createUserSimpleGit(repoPath);
	const commit = async (
		message: string,
		files: Record<string, string> = { "README.md": message },
	): Promise<string> => {
		for (const [path, contents] of Object.entries(files)) {
			writeFileSync(join(repoPath, path), contents);
			await git.add(path);
		}
		const result = await git.commit(message, undefined, {
			"--allow-empty": null,
		});
		return result.commit;
	};
	const dispose = (): void => {
		rmSync(repoPath, { recursive: true, force: true });
	};
	return { repoPath, git, commit, dispose };
}

/**
 * Create a real on-disk git repo in a temp directory. Configures user.name /
 * user.email locally so commits don't depend on the developer's global config,
 * and seeds an initial commit on `main` so HEAD is resolvable. Caller MUST
 * call `dispose()` to clean up.
 */
export async function createGitFixture(): Promise<GitFixture> {
	const fixture = fixtureAt(makeRepoDir());
	const { git } = fixture;

	await git.init(["--initial-branch=main"]);
	await git.addConfig("user.email", "test@superset.local");
	await git.addConfig("user.name", "Test Runner");
	await git.addConfig("commit.gpgsign", "false");
	await fixture.commit("initial commit");

	return fixture;
}

/**
 * A copy of `template` in a new temp directory: much cheaper than
 * {@link createGitFixture} when a suite needs many fresh repos. The template
 * must have no worktrees or remotes.
 */
export function copyGitFixture(template: GitFixture): GitFixture {
	const repoPath = makeRepoDir();
	cpSync(template.repoPath, repoPath, { recursive: true });
	return fixtureAt(repoPath);
}
