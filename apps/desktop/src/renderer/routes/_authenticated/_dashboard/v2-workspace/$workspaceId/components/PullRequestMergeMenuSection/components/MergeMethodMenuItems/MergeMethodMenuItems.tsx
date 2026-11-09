import { useLingui } from "@lingui/react/macro";
import {
	type MergeMethod,
	mergeMethodChoices,
} from "@superset/shared/pull-request-merge-methods";
import { DropdownMenuItem } from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { VscGitMerge } from "react-icons/vsc";
import { useMergeMethodLabels } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/useMergeMethodLabels";
import {
	cachedMergeMethods,
	pullRequestDetailQueryOptions,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestDetail";
import type { PullRequestTarget } from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/pullRequestClient";

interface MergeMethodMenuItemsProps {
	target: PullRequestTarget | null;
	isMerging: boolean;
	onMerge: (method: MergeMethod) => void;
	className?: string;
	iconClassName?: string;
}

/**
 * The merge methods the repository allows, in GitHub's order, with its
 * default checked. Mounted only while its menu is open, so the PR read runs
 * on open and shares the pull request page's cache.
 */
export function MergeMethodMenuItems({
	target,
	isMerging,
	onMerge,
	className,
	iconClassName,
}: MergeMethodMenuItemsProps) {
	const { t } = useLingui();
	const labels = useMergeMethodLabels();
	const { data: choices, isLoading } = useQuery({
		...pullRequestDetailQueryOptions({
			organizationId: target?.organizationId ?? null,
			repoFullName: target?.repoFullName ?? null,
			prNumber: target?.prNumber ?? null,
		}),
		enabled: Boolean(target?.repoFullName),
		select: cachedMergeMethods,
	});
	const { methods, primary } = choices ?? mergeMethodChoices(null);

	return methods.map((method) => (
		<DropdownMenuItem
			key={method}
			className={className}
			disabled={isMerging || isLoading}
			onClick={() => onMerge(method)}
		>
			<VscGitMerge className={iconClassName} />
			{labels[method]}
			{choices && method === primary ? (
				<>
					<span className="sr-only">{t({ message: "Default" })}</span>
					<Check
						aria-hidden
						strokeWidth={1.75}
						className={cn("ml-auto text-muted-foreground", iconClassName)}
					/>
				</>
			) : null}
		</DropdownMenuItem>
	));
}
