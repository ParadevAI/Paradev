import { Trans } from "@lingui/react/macro";
import Link from "next/link";
import {
	type ComparisonPageType,
	getComparisonPageTypeLabel,
} from "@/lib/compare-utils";

export interface RelatedComparison {
	slug: string;
	href: string;
	title: string;
	type: ComparisonPageType;
}

interface RelatedComparisonsProps {
	pages: RelatedComparison[];
}

export function RelatedComparisons({ pages }: RelatedComparisonsProps) {
	if (pages.length === 0) return null;

	return (
		<nav aria-labelledby="related-comparisons" className="mt-12">
			<h2
				id="related-comparisons"
				className="text-xl font-medium text-foreground mb-6"
			>
				<Trans>Related comparisons</Trans>
			</h2>
			<ul className="flex flex-col gap-3">
				{pages.map((page) => (
					<li key={page.slug}>
						<Link
							href={page.href}
							className="group flex items-baseline justify-between gap-4 border border-border rounded-lg px-5 py-4 hover:border-foreground/20 transition-colors"
						>
							<span className="text-base font-medium text-foreground group-hover:text-foreground/80 transition-colors">
								{page.title}
							</span>
							<span className="shrink-0 text-xs font-mono text-muted-foreground uppercase tracking-wider">
								{getComparisonPageTypeLabel(page.type)}
							</span>
						</Link>
					</li>
				))}
			</ul>
		</nav>
	);
}
