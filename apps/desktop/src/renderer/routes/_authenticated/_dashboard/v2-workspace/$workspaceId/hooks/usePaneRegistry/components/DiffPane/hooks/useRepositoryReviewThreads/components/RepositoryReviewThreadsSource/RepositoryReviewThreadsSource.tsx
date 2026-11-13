import { useEffect } from "react";
import { useReviewThreadActions } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/useReviewThreadActions";
import { useLinkedPullRequest } from "../../../../../../../useLinkedPullRequest";
import { useDiffAnnotationsByPath } from "../../../useDiffAnnotations";
import type { RepositoryReviewThreads } from "../../types";

interface RepositoryReviewThreadsSourceProps {
	workspaceId: string;
	repositoryId: string;
	onChange: (repositoryId: string, threads: RepositoryReviewThreads) => void;
}

/** Reports one checkout's review threads and the actions on its own pull request. */
export function RepositoryReviewThreadsSource({
	workspaceId,
	repositoryId,
	onChange,
}: RepositoryReviewThreadsSourceProps) {
	const annotationsByPath = useDiffAnnotationsByPath({
		workspaceId,
		repositoryId,
	});
	const { target } = useLinkedPullRequest(workspaceId, repositoryId, {
		enabled: false,
	});
	const actions = useReviewThreadActions(target);
	useEffect(() => {
		onChange(repositoryId, { annotationsByPath, actions });
	}, [onChange, repositoryId, annotationsByPath, actions]);
	return null;
}
