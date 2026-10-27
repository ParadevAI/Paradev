import { Trans } from "@lingui/react/macro";
import type { SupportedLocale } from "@superset/i18n";
import { formatDate } from "@superset/i18n/format";
import Image from "next/image";
import { SectionHeading } from "../SectionHeading";
import { PRESS_ARTICLES } from "./constants";

interface PressCoverageSectionProps {
	lang: SupportedLocale;
}

export function PressCoverageSection({ lang }: PressCoverageSectionProps) {
	const dateFormat = {
		year: "numeric",
		month: "long",
		day: "numeric",
		timeZone: "UTC",
	} as const;

	return (
		<section aria-labelledby="press-coverage">
			<SectionHeading id="press-coverage">
				<Trans>Press coverage</Trans>
			</SectionHeading>
			<ul className="mt-6 divide-y divide-border">
				{PRESS_ARTICLES.map((article) => (
					<li key={article.url} className="py-5 first:pt-0 last:pb-0">
						<p className="flex items-center gap-2 font-mono text-muted-foreground text-xs">
							<Image
								src={article.icon}
								alt=""
								width={16}
								height={16}
								className="size-4 shrink-0 rounded-sm"
							/>
							<span>
								{article.outlet} ·{" "}
								<time dateTime={article.date}>
									{formatDate(
										new Date(`${article.date}T00:00:00Z`),
										dateFormat,
										lang,
									)}
								</time>
							</span>
						</p>
						<a
							href={article.url}
							target="_blank"
							rel="noopener noreferrer"
							className="mt-1.5 inline-block font-medium text-foreground text-lg leading-snug underline-offset-4 hover:underline"
						>
							{article.title}
						</a>
					</li>
				))}
			</ul>
		</section>
	);
}
