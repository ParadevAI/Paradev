import { Trans } from "@lingui/react/macro";
import type { SupportedLocale } from "@superset/i18n";
import { formatDate } from "@superset/i18n/format";
import { BRAND } from "@superset/shared/brand";
import { COMPANY } from "@superset/shared/constants";
import Link from "next/link";
import { SectionHeading } from "../SectionHeading";
import { MOBILE_LAUNCH_DATE, RENAME_DATE, RENAME_POST_SLUG } from "./constants";

const productName = BRAND.NAME;
const formerName = BRAND.FORMER_NAME;
const isRenamed = BRAND.NAME !== BRAND.FORMER_NAME;

interface LatestNewsSectionProps {
	lang: SupportedLocale;
}

export function LatestNewsSection({ lang }: LatestNewsSectionProps) {
	const dateFormat = {
		year: "numeric",
		month: "long",
		day: "numeric",
		timeZone: "UTC",
	} as const;
	const renameDate = formatDate(RENAME_DATE, dateFormat, lang);
	const launchDate = formatDate(MOBILE_LAUNCH_DATE, dateFormat, lang);
	const localePrefix = lang === "en" ? "" : `/${lang}`;
	const renamePostPath = `${localePrefix}/blog/${RENAME_POST_SLUG}`;
	const mobilePath = `${localePrefix}/mobile`;

	return (
		<section aria-labelledby="latest-news">
			<SectionHeading id="latest-news">
				<Trans>Latest news</Trans>
			</SectionHeading>
			<div className="mt-6 divide-y divide-border [&>article]:py-10 [&>article:first-child]:pt-0 [&>article:last-child]:pb-0">
				{isRenamed && (
					<article>
						<p className="font-mono text-muted-foreground text-xs">
							<time dateTime={RENAME_DATE.toISOString().slice(0, 10)}>
								{renameDate}
							</time>
						</p>
						<h3 className="mt-2 font-medium text-2xl text-foreground tracking-tight">
							<Trans>
								{formerName} is now {productName}
							</Trans>
						</h3>
						<p className="mt-4 text-muted-foreground leading-relaxed">
							<Trans>
								{formerName} is now called {productName}. It is the same
								product, built by the same team, and only the name has changed.
								Existing superset.sh links redirect, and the superset command
								keeps working.
							</Trans>{" "}
							<Trans>
								The announcement also shares the $11.5M seed round led by Union
								Square Ventures, with Y Combinator and Paul Graham.
							</Trans>
						</p>
						<div className="mt-6 flex flex-wrap gap-3 text-sm">
							<Link
								href={renamePostPath}
								className="border border-border px-4 py-2 text-foreground transition-colors hover:border-foreground"
							>
								<Trans>Read the announcement</Trans>
							</Link>
						</div>
					</article>
				)}
				<article>
					<p className="font-mono text-muted-foreground text-xs">
						<time dateTime="2026-09-21">{launchDate}</time>
					</p>
					<h3 className="mt-2 font-medium text-2xl text-foreground tracking-tight">
						<Trans>Superset Mobile launches on iPhone</Trans>
					</h3>
					<p className="mt-4 text-muted-foreground leading-relaxed">
						<Trans>
							Paradev Mobile lets developers continue the Paradev workspaces
							they already use on their computer from an iPhone.
						</Trans>
					</p>
					<ul className="mt-4 list-disc space-y-1.5 pl-5 text-muted-foreground leading-relaxed">
						<li>
							<Trans>Continue the same workspace from your iPhone</Trans>
						</li>
						<li>
							<Trans>Prompt agents and answer their questions</Trans>
						</li>
						<li>
							<Trans>Follow terminal sessions live</Trans>
						</li>
						<li>
							<Trans>Review syntax-highlighted diffs</Trans>
						</li>
					</ul>
					<p className="mt-4 text-muted-foreground leading-relaxed">
						<Trans>
							The app is free to download. It requires iOS 26 or later and
							Paradev Pro. Android is next.
						</Trans>
					</p>
					<div className="mt-6 flex flex-wrap gap-3 text-sm">
						<a
							href={COMPANY.APP_STORE_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="bg-foreground px-4 py-2 font-medium text-background transition-colors hover:bg-brand hover:text-white"
						>
							<Trans>View on the App Store</Trans>
						</a>
						<Link
							href={mobilePath}
							className="border border-border px-4 py-2 text-foreground transition-colors hover:border-foreground"
						>
							<Trans>Paradev Mobile page</Trans>
						</Link>
					</div>
				</article>
			</div>
		</section>
	);
}
