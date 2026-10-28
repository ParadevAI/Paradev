import { Trans } from "@lingui/react/macro";
import type { SupportedLocale } from "@superset/i18n";
import Link from "next/link";
import { PressCoverage } from "@/app/[lang]/components/PressCoverage";
import { SectionHeading } from "../SectionHeading";

interface PressCoverageSectionProps {
	lang: SupportedLocale;
}

export function PressCoverageSection({ lang }: PressCoverageSectionProps) {
	const localePrefix = lang === "en" ? "" : `/${lang}`;

	return (
		<section aria-labelledby="press-coverage">
			<SectionHeading id="press-coverage">
				<Trans>Press coverage</Trans>
			</SectionHeading>
			<PressCoverage lang={lang} variant="featured" />
			<div className="mt-6 border-border border-t pt-6">
				<Link
					href={`${localePrefix}/press`}
					className="border border-border px-4 py-2 text-foreground text-sm transition-colors hover:border-foreground"
				>
					<Trans>View all</Trans>
				</Link>
			</div>
		</section>
	);
}
