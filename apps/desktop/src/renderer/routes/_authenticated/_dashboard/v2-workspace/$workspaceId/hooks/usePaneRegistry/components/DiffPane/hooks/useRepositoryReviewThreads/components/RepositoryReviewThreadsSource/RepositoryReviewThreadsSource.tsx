import { useEffect } from "react";
import { useReviewThreadActions } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/useReviewThreadActions";
import { useLinkedPullRequest } from "../../../../../../../useLinkedPullRequest";
import { useDiffAnnotationsByPath } from "../../../useDiffAnnotations";
import type { RepositoryReviewThreads } from "../../types";

interface RepositoryReviewThreadsSourceProps {
	workspaceId: string;
	onChange: (workspaceId: string, threads: RepositoryReviewThreads) => void;
}

/** Reports one checkout's review threads and the actions on its own pull request. */
export function RepositoryReviewThreadsSource({
	workspaceId,
	onChange,
}: RepositoryReviewThreadsSourceProps) {
	const annotationsByPath = useDiffAnnotationsByPath({ workspaceId });
	const { target } = useLinkedPullRequest(workspaceId, { enabled: false });
	const actions = useReviewThreadActions(target);
	useEffect(() => {
		onChange(workspaceId, { annotationsByPath, actions });
	}, [onChange, workspaceId, annotationsByPath, actions]);
	return null;
}
