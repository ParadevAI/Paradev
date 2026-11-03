import { Trans } from "@lingui/react/macro";

interface PullRequestReviewStateLabelProps {
	state: string | null;
}

/** A review's verdict as the verb GitHub uses, in its colour; null for a bare comment review. */
export function PullRequestReviewStateLabel({
	state,
}: PullRequestReviewStateLabelProps) {
	switch (state?.trim().toUpperCase()) {
		case "APPROVED":
			return (
				<span className="shrink-0 text-emerald-600 [.dark_&]:text-emerald-400">
					<Trans>approved</Trans>
				</span>
			);
		case "CHANGES_REQUESTED":
			return (
				<span className="shrink-0 text-rose-600 [.dark_&]:text-rose-400">
					<Trans>requested changes</Trans>
				</span>
			);
		case "DISMISSED":
			return (
				<span className="shrink-0">
					<Trans>dismissed their review</Trans>
				</span>
			);
		case "COMMENTED":
			return (
				<span className="shrink-0">
					<Trans>reviewed</Trans>
				</span>
			);
		default:
			return null;
	}
}
