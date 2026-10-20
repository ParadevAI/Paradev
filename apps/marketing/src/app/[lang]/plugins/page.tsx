import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { getI18nInstance } from "@superset/i18n/server";
import { BRAND } from "@superset/shared/brand";
import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { CTASection } from "@/app/[lang]/components/CTASection";
import { ProductHeroActions } from "@/app/[lang]/components/ProductHeroActions";
import { localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { AgentStrip } from "./components/AgentStrip";
import { BuildOnce } from "./components/BuildOnce";
import { HowItWorks } from "./components/HowItWorks";
import { LaunchFilm } from "./components/LaunchFilm";
import { PluginCatalog } from "./components/PluginCatalog";
import { FEATURES } from "./constants";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const i18n = getI18nInstance(lang);
	const title = i18n._(msg({ message: "Superset Plugins" }));
	const description = i18n._(
		msg({
			message:
				"One plugin, every coding agent: Claude Code, Codex, Cursor, OpenCode and more. Install once, use it on your machines and in the cloud.",
		}),
	);
	const image = {
		url: "/plugins/og.jpg",
		width: 2400,
		height: 1258,
		alt: title,
	};
	return {
		title,
		description,
		alternates: localizedAlternates(lang, "/plugins"),
		openGraph: {
			title,
			description,
			type: "website",
			url: `${COMPANY.MARKETING_URL}/plugins`,
			siteName: BRAND.NAME,
			images: [image],
		},
		twitter: {
			card: "summary_large_image",
			title,
			description,
			images: [image.url],
			creator: "@superset_sh",
		},
	};
}

export default async function PluginsPage() {
	await initServerI18n();
	const { t } = useLingui();

	return (
		<div className="overflow-x-clip">
			<main className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-8 sm:py-20">
				<section>
					<div className="max-w-3xl">
						<p className="font-mono text-brand text-xs uppercase tracking-wider">
							<Trans>Superset Plugins</Trans>
						</p>
						<h1 className="mt-4 font-medium text-balance text-4xl text-foreground tracking-tight sm:text-5xl">
							<Trans>One plugin. Every coding agent.</Trans>
						</h1>
						<p className="mt-5 max-w-xl text-lg text-muted-foreground leading-relaxed">
							<Trans>
								Install once. Every agent gets it, on your machines and in the
								cloud.
							</Trans>
						</p>
						<ProductHeroActions source="plugins" docsPath="/mcp-server" />
						<AgentStrip />
					</div>
					<PluginCatalog />
				</section>

				<LaunchFilm />

				<section className="mt-24 sm:mt-32">
					<p className="font-mono text-brand text-xs uppercase tracking-wider">
						<Trans>How it works</Trans>
					</p>
					<h2 className="mt-4 font-medium text-3xl text-foreground tracking-tight sm:text-4xl">
						<Trans>Install once. Mention it in any prompt.</Trans>
					</h2>
					<HowItWorks />
					<div className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
						{FEATURES.map((feature) => (
							<div
								key={feature.title.id}
								className="border-border border-t pt-4"
							>
								<h3 className="font-medium text-foreground">
									{t(feature.title)}
								</h3>
								<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
									{t(feature.description)}
								</p>
							</div>
						))}
					</div>
				</section>

				<BuildOnce />
			</main>
			<CTASection />
		</div>
	);
}
