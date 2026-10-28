import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { getI18nInstance } from "@superset/i18n/server";
import { BRAND } from "@superset/shared/brand";
import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { AtAGlanceSection } from "./components/AtAGlanceSection";
import { BrandAssetsSection } from "./components/BrandAssetsSection";
import { LatestNewsSection } from "./components/LatestNewsSection";

const productName = BRAND.NAME;
const formerName = BRAND.FORMER_NAME;
const isRenamed = BRAND.NAME !== BRAND.FORMER_NAME;

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const i18n = getI18nInstance(lang);
	return {
		title: i18n._(msg({ message: "Media kit" })),
		description: isRenamed
			? i18n._(
					msg({
						message: `Company boilerplate, latest news, brand assets, and press contact for ${productName} (formerly ${formerName}).`,
					}),
				)
			: i18n._(
					msg({
						message: `Company boilerplate, latest news, brand assets, and press contact for ${productName}.`,
					}),
				),
		alternates: localizedAlternates(lang, "/media"),
		robots: { index: false, follow: false },
	};
}

export default async function MediaPage() {
	const lang = await initServerI18n();
	return (
		<main className="mx-auto w-full max-w-4xl px-6 py-12 sm:px-8 sm:py-20">
			<header>
				<p className="font-mono text-brand text-xs uppercase tracking-wider">
					<Trans>Media kit</Trans>
				</p>
				<h1 className="mt-4 font-medium text-4xl text-foreground tracking-tight sm:text-5xl">
					<Trans>{productName} for press</Trans>
				</h1>
				<p className="mt-5 max-w-xl text-lg text-muted-foreground leading-relaxed">
					{isRenamed ? (
						<Trans>
							Everything you need to write about {productName} (formerly{" "}
							{formerName}): our company description, latest news, logos,
							product images, and who to contact.
						</Trans>
					) : (
						<Trans>
							Everything you need to write about {productName}: our company
							description, latest news, logos, product images, and who to
							contact.
						</Trans>
					)}
				</p>
				<p className="mt-4 text-muted-foreground">
					<Trans>For press inquiries and interview requests, email us.</Trans>{" "}
					<a
						href={COMPANY.FOUNDERS_MAIL_TO}
						className="font-medium text-foreground underline-offset-4 hover:underline"
					>
						{COMPANY.FOUNDERS_EMAIL}
					</a>
				</p>
			</header>
			<div className="mt-14 space-y-16 sm:mt-20 sm:space-y-20">
				<AtAGlanceSection />
				<LatestNewsSection lang={lang} />
				<BrandAssetsSection />
			</div>
		</main>
	);
}
