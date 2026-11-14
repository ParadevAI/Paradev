import type { workspaceTrpc } from "@superset/workspace-client";
import { checkoutInput } from "../../../../utils/checkoutInput";
import type { CheckoutGitStatus } from "../../types";

type GitUtils = Pick<
	ReturnType<typeof workspaceTrpc.useUtils>["git"],
	"getBaseBranch" | "getStatus"
>;

/** The status a checkout's source will read from the cache, before it publishes it. */
export function readCachedCheckoutGitStatus(
	git: GitUtils,
	workspaceId: string,
	repositoryId: string | undefined,
): CheckoutGitStatus | undefined {
	const scope = checkoutInput(workspaceId, repositoryId);
	const baseBranch = git.getBaseBranch.getData(scope)?.baseBranch ?? undefined;
	const data = git.getStatus.getData({
		...scope,
		baseBranch,
		priority: "foreground",
	});
	if (data === undefined) return undefined;
	return {
		data,
		isLoading: false,
		isFetching: false,
		isError: false,
		error: null,
	};
}
