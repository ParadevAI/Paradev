import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { getI18nInstance } from "@superset/i18n/server";
import { BRAND } from "@superset/shared/brand";
import type { Metadata } from "next";
import Link from "next/link";
import { localeUrl, localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { PressCoverage } from "../components/PressCoverage";

const productName = BRAND.NAME;

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const i18n = getI18nInstance(lang);
	return {
		title: i18n._(msg({ message: "Press" })),
		description: i18n._(
			msg({ message: `Articles and coverage about ${productName}.` }),
		),
		alternates: {
			canonical: localeUrl(lang, "/press"),
			languages: localizedAlternates(lang, "/press").languages,
		},
	};
}

export default async function PressPage() {
	const lang = await initServerI18n();
	const localePrefix = lang === "en" ? "" : `/${lang}`;
	return (
		<main className="mx-auto w-full max-w-4xl px-6 py-12 sm:px-8 sm:py-20">
			<header>
				<p className="font-mono text-brand text-xs uppercase tracking-wider">
					<Trans>Press</Trans>
				</p>
				<h1 className="mt-4 font-medium text-4xl text-foreground tracking-tight sm:text-5xl">
					<Trans>{productName} in the press</Trans>
				</h1>
				<p className="mt-5 max-w-xl text-lg text-muted-foreground leading-relaxed">
					<Trans>Articles and coverage about {productName}.</Trans>{" "}
					<Link
						href={`${localePrefix}/media`}
						className="text-foreground underline-offset-4 hover:underline"
					>
						<Trans>Media kit</Trans>
					</Link>
				</p>
			</header>
			<div className="mt-12 sm:mt-16">
				<PressCoverage lang={lang} variant="all" />
			</div>
		</main>
	);
}
