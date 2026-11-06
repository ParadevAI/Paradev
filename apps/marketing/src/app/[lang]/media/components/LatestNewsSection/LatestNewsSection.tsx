import { Trans } from "@lingui/react/macro";
import type { SupportedLocale } from "@superset/i18n";
import { formatDate } from "@superset/i18n/format";
import { BRAND } from "@superset/shared/brand";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PressCoverage } from "@/app/[lang]/components/PressCoverage";
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
	const localePrefix = lang === "en" ? "" : `/${lang}`;

	const announcements: {
		id: string;
		date: Date;
		title: ReactNode;
		href: string;
	}[] = [
		...(isRenamed
			? [
					{
						id: "rename",
						date: RENAME_DATE,
						title: (
							<Trans>
								{formerName} is now {productName}
							</Trans>
						),
						href: `${localePrefix}/blog/${RENAME_POST_SLUG}`,
					},
				]
			: []),
		{
			id: "mobile",
			date: MOBILE_LAUNCH_DATE,
			title: <Trans>Superset Mobile launches on iPhone</Trans>,
			href: `${localePrefix}/mobile`,
		},
	];

	return (
		<section aria-labelledby="latest-news">
			<SectionHeading id="latest-news">
				<Trans>Latest news</Trans>
			</SectionHeading>
			<ul className="divide-y divide-border">
				{announcements.map((item) => (
					<li key={item.id}>
						<Link
							href={item.href}
							className="group flex items-baseline gap-6 py-4"
						>
							<time
								dateTime={item.date.toISOString().slice(0, 10)}
								className="w-40 shrink-0 font-mono text-muted-foreground text-xs"
							>
								{formatDate(item.date, dateFormat, lang)}
							</time>
							<span className="flex-1 font-medium text-foreground text-lg underline-offset-4 group-hover:underline">
								{item.title}
							</span>
							<ArrowUpRight
								aria-hidden="true"
								className="size-4 shrink-0 self-center text-muted-foreground transition-colors group-hover:text-foreground"
							/>
						</Link>
					</li>
				))}
			</ul>

			<h3 className="mt-12 border-border border-b pb-3 font-mono text-muted-foreground text-xs uppercase tracking-wider">
				<Trans>Press coverage</Trans>
			</h3>
			<PressCoverage lang={lang} variant="featured" />
			<div className="border-border border-t pt-6">
				<Link
					href={`${localePrefix}/press`}
					className="inline-block border border-border px-4 py-2 text-foreground text-sm transition-colors hover:border-foreground"
				>
					<Trans>View all</Trans>
				</Link>
			</div>
		</section>
	);
}
