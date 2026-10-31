"use client";

import { Trans } from "@lingui/react/macro";
import { BRAND } from "@superset/shared/brand";
import type { MouseEvent, ReactNode } from "react";
import { GridCross } from "@/app/[lang]/blog/components/GridCross";
import { usePlatform } from "@/app/[lang]/hooks/useOS";
import { track } from "@/lib/analytics";
import type { TocItem } from "@/lib/blog-utils";
import {
	type ComparisonPage,
	formatCompareDate,
	getComparisonPageTypeLabel,
} from "@/lib/compare-utils";
import { CompareDownloadCTA } from "./components/CompareDownloadCTA";
import { TableOfContents } from "./components/TableOfContents";

const productName = BRAND.NAME;
const formerName = BRAND.FORMER_NAME;
const isRenamed = BRAND.NAME !== BRAND.FORMER_NAME;
const MIN_SECTIONS_FOR_TOC = 4;

interface CompareLayoutProps {
	page: ComparisonPage;
	toc: TocItem[];
	children: ReactNode;
	faq: ReactNode;
}

export function CompareLayout({
	page,
	toc,
	children,
	faq,
}: CompareLayoutProps) {
	const sections = toc.filter((item) => item.level === 2);
	const { platform } = usePlatform();
	const formattedDate = formatCompareDate(page.lastUpdated ?? page.date);
	const pageTypeLabel = getComparisonPageTypeLabel(page.type);

	const trackInlineDownloadClick = (event: MouseEvent<HTMLDivElement>) => {
		const link = (event.target as HTMLElement).closest("a");
		if (
			link?.origin === window.location.origin &&
			link.pathname === "/download"
		) {
			track("download_clicked", {
				platform,
				source: "compare",
				slug: page.slug,
				placement: "inline",
			});
		}
	};

	return (
		<article className="relative min-h-screen">
			{/* Grid background with dashed lines */}
			<div
				className="absolute inset-0 pointer-events-none"
				style={{
					backgroundImage: `
						linear-gradient(to right, transparent 0%, transparent calc(50% - 384px), rgba(255,255,255,0.06) calc(50% - 384px), rgba(255,255,255,0.06) calc(50% - 383px), transparent calc(50% - 383px), transparent calc(50% + 383px), rgba(255,255,255,0.06) calc(50% + 383px), rgba(255,255,255,0.06) calc(50% + 384px), transparent calc(50% + 384px))
					`,
				}}
			/>

			{/* Hero header */}
			<header className="relative border-b border-border">
				<div className="max-w-3xl mx-auto px-6 pt-16 pb-10 md:pt-20 md:pb-12">
					{/* Grid crosses */}
					<GridCross className="top-0 left-0" />
					<GridCross className="top-0 right-0" />

					<div className="text-center">
						<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
							{pageTypeLabel}
						</span>

						<h1 className="text-3xl md:text-4xl lg:text-5xl font-medium tracking-tight text-foreground mt-4 mb-4">
							{page.title}
						</h1>

						{page.description && (
							<p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto mb-6">
								{page.description}
							</p>
						)}

						<div className="mb-8">
							<CompareDownloadCTA slug={page.slug} placement="hero" />
						</div>

						<div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
							<span>
								<Trans>Last updated</Trans>
							</span>
							<span className="text-muted-foreground/50">·</span>
							<time dateTime={page.lastUpdated ?? page.date}>
								{formattedDate}
							</time>
						</div>

						{isRenamed && (
							<p className="mt-2 text-sm text-muted-foreground">
								<Trans>
									{productName} was called {formerName} until October 2026.
								</Trans>
							</p>
						)}
					</div>
				</div>

				{/* Bottom crosses */}
				<div className="max-w-3xl mx-auto px-6 relative">
					<GridCross className="bottom-0 left-0" />
					<GridCross className="bottom-0 right-0" />
				</div>
			</header>

			{/* Content */}
			<div className="relative max-w-3xl mx-auto px-6 py-12">
				{sections.length >= MIN_SECTIONS_FOR_TOC && (
					<TableOfContents items={sections} />
				)}
				<div
					className="prose max-w-none"
					onClickCapture={trackInlineDownloadClick}
				>
					{children}
				</div>

				<aside className="my-12 border-y border-border py-10 text-center">
					<h2 className="text-xl font-medium text-foreground">
						<Trans>Run parallel coding agents with Paradev</Trans>
					</h2>
					<p className="mt-2 mb-6 text-muted-foreground">
						<Trans>
							Give Claude Code, Codex, or any CLI agent its own workspace and
							branch, then review every change in one place.
						</Trans>
					</p>
					<CompareDownloadCTA slug={page.slug} placement="verdict" />
				</aside>

				{faq && (
					<div
						className="prose max-w-none"
						onClickCapture={trackInlineDownloadClick}
					>
						{faq}
					</div>
				)}
			</div>
		</article>
	);
}
