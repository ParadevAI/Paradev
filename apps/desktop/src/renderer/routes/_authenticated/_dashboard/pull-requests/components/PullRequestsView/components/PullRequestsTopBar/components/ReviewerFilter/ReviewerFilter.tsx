import type { ProjectQueryTarget } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectQueryTargets";
import { PullRequestUserFilter } from "../PullRequestUserFilter";

interface ReviewerFilterProps {
	value: string | null;
	onChange: (value: string | null) => void;
	projectTargets: ProjectQueryTarget[];
}

export function ReviewerFilter(props: ReviewerFilterProps) {
	return <PullRequestUserFilter kind="reviewer" {...props} />;
}
