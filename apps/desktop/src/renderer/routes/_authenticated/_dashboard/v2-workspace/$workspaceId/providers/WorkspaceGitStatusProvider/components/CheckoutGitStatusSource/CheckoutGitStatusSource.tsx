import { useEffect, useMemo } from "react";
import { useCheckoutGitStatusQuery } from "../../hooks/useCheckoutGitStatusQuery";
import type { CheckoutGitStatus } from "../../types";

interface CheckoutGitStatusSourceProps {
	workspaceId: string;
	repositoryId: string | undefined;
	onChange: (
		workspaceId: string,
		key: string,
		status: CheckoutGitStatus,
	) => void;
}

/** Keeps one checkout's status in the provider; renders nothing. */
export function CheckoutGitStatusSource({
	workspaceId,
	repositoryId,
	onChange,
}: CheckoutGitStatusSourceProps) {
	const { data, isLoading, isFetching, isError, error } =
		useCheckoutGitStatusQuery(workspaceId, repositoryId);
	const status = useMemo(
		() => ({ data, isLoading, isFetching, isError, error }),
		[data, isLoading, isFetching, isError, error],
	);
	useEffect(() => {
		onChange(workspaceId, repositoryId ?? "", status);
	}, [onChange, workspaceId, repositoryId, status]);
	return null;
}
