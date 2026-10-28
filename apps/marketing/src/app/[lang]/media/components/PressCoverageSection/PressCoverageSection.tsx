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
			<ul className="mt-6 grid gap-5 sm:grid-cols-2">
				{PRESS_ARTICLES.map((article) => (
					<li key={article.url}>
						<a
							href={article.url}
							target="_blank"
							rel="noopener noreferrer"
							className="group flex h-full flex-col border border-border transition-colors hover:border-foreground"
						>
							<div className="relative aspect-[1.91/1] overflow-hidden border-border border-b bg-muted">
								{article.image ? (
									<Image
										src={article.image}
										alt=""
										fill
										sizes="(min-width: 640px) 432px, 100vw"
										className="object-cover"
									/>
								) : (
									<div className="flex h-full items-center justify-center">
										<Image
											src={article.icon}
											alt=""
											width={48}
											height={48}
											className="size-12 rounded-lg"
										/>
									</div>
								)}
							</div>
							<div className="p-4">
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
								<p
									lang={article.titleLang}
									className="mt-2 font-medium text-foreground text-lg leading-snug underline-offset-4 group-hover:underline"
								>
									{article.title}
								</p>
							</div>
						</a>
					</li>
				))}
			</ul>
		</section>
	);
}
