import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { Skeleton } from "@superset/ui/skeleton";
import {
	type EvidencePage,
	EvidencePageCard,
} from "./components/EvidencePageCard";

interface PullRequestEvidenceProps {
	pages: EvidencePage[];
	totalCount?: number;
	moreCount: number;
	onShowMore: () => void;
	isPending: boolean;
	isError: boolean;
	onRetry: () => void;
	onOpenPage: (page: EvidencePage) => void;
}

export function PullRequestEvidence({
	pages,
	totalCount,
	moreCount,
	onShowMore,
	isPending,
	isError,
	onRetry,
	onOpenPage,
}: PullRequestEvidenceProps) {
	const { t } = useLingui();
	const { formatNumber } = useFormat();

	return (
		<section
			className="flex min-w-0 flex-col gap-2.5"
			aria-label={t({ message: "Pages" })}
		>
			<div className="flex h-6 items-center">
				<h2 className="m-0 flex items-center gap-1 text-xs font-normal text-muted-foreground">
					<Trans>Pages</Trans>
					{!isPending && totalCount !== undefined ? (
						<span className="min-w-4 rounded-full bg-muted px-1 text-center tabular-nums">
							{formatNumber(totalCount)}
						</span>
					) : null}
				</h2>
			</div>
			{isPending ? (
				<output
					aria-label={t({ message: "Loading…" })}
					className="grid grid-cols-[repeat(auto-fill,101px)] gap-2.5"
				>
					{[0, 1, 2].map((key) => (
						<Skeleton key={key} className="h-[108px] rounded-lg" />
					))}
				</output>
			) : (
				<>
					{pages.length > 0 ? (
						<div className="grid grid-cols-[repeat(auto-fill,101px)] gap-2.5">
							{pages.map((page) => (
								<EvidencePageCard
									key={page.id}
									page={page}
									onOpen={onOpenPage}
								/>
							))}
						</div>
					) : null}
					{moreCount > 0 ? (
						<button
							type="button"
							onClick={onShowMore}
							className="self-start rounded text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<Trans>Show {formatNumber(moreCount)} more</Trans>
						</button>
					) : null}
					{isError ? (
						<div
							role="alert"
							className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
						>
							<Trans>Pages could not be loaded</Trans>
							<button
								type="button"
								onClick={onRetry}
								className="rounded text-foreground underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<Trans>Retry</Trans>
							</button>
						</div>
					) : null}
				</>
			)}
		</section>
	);
}
