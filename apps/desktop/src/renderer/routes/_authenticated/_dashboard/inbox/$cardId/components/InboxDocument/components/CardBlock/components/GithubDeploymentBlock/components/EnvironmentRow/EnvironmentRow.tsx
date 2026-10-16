import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { Checkbox } from "@superset/ui/checkbox";
import { LuExternalLink } from "react-icons/lu";
import type { GithubEnvironmentView } from "../../../../types";
import { GithubAvatar } from "../../../GithubAvatar";

interface EnvironmentRowProps {
	environment: GithubEnvironmentView;
	checked: boolean;
	disabled: boolean;
	onCheck: (checked: boolean) => void;
}

/** One environment of GitHub's "Review pending deployments" list: its checkbox, wait timer and reviewers. */
export function EnvironmentRow({
	environment,
	checked,
	disabled,
	onCheck,
}: EnvironmentRowProps) {
	const { t } = useLingui();
	return (
		<li
			data-environment={environment.id}
			className="flex min-w-0 items-start gap-2.5 px-3 py-2"
		>
			<Checkbox
				className="mt-0.5"
				aria-label={environment.name}
				checked={checked}
				disabled={disabled || !environment.canApprove}
				onCheckedChange={(next) => onCheck(next === true)}
			/>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<div className="flex min-w-0 items-center gap-2 text-[13px]">
					{environment.url ? (
						<a
							href={environment.url}
							target="_blank"
							rel="noreferrer"
							className="inline-flex min-w-0 items-center gap-1 font-medium text-foreground hover:underline"
						>
							<span className="truncate">{environment.name}</span>
							<LuExternalLink className="size-3 shrink-0 opacity-60" />
						</a>
					) : (
						<span className="min-w-0 truncate font-medium text-foreground">
							{environment.name}
						</span>
					)}
					{environment.waitTimer > 0 && (
						<span className="shrink-0 text-xs text-muted-foreground">
							{t({
								message: plural(environment.waitTimer, {
									one: "Wait timer: # minute",
									other: "Wait timer: # minutes",
								}),
							})}
						</span>
					)}
				</div>
				{environment.reviewers.length > 0 && (
					<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
						{environment.reviewers.map((reviewer) => (
							<span
								key={`${reviewer.kind}:${reviewer.name}`}
								className="inline-flex items-center gap-1.5"
							>
								<GithubAvatar
									name={reviewer.name}
									avatarUrl={reviewer.avatarUrl}
								/>
								{reviewer.name}
							</span>
						))}
					</div>
				)}
			</div>
		</li>
	);
}
