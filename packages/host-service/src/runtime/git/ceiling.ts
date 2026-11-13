import { dirname } from "node:path";

/**
 * Stops git from walking up out of a checkout: a multi-repo workspace folder
 * can sit inside an unrelated repository, and git there must fail instead.
 */
export function gitCeilingEnv(checkoutPath: string): {
	GIT_CEILING_DIRECTORIES: string;
} {
	return { GIT_CEILING_DIRECTORIES: dirname(checkoutPath) };
}
