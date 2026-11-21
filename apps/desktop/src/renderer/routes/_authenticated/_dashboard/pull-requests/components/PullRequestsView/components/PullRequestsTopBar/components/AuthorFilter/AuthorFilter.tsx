import type { ProjectQueryTarget } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectQueryTargets";
import { PullRequestUserFilter } from "../PullRequestUserFilter";

interface AuthorFilterProps {
	value: string | null;
	onChange: (value: string | null) => void;
	projectTargets: ProjectQueryTarget[];
}

export function AuthorFilter(props: AuthorFilterProps) {
	return <PullRequestUserFilter kind="author" {...props} />;
}
