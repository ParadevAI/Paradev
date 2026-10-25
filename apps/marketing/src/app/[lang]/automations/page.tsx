import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { getI18nInstance } from "@superset/i18n/server";
import { COMPANY } from "@superset/shared/constants";
import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import { CTASection } from "@/app/[lang]/components/CTASection";
import { ProductHeroActions } from "@/app/[lang]/components/ProductHeroActions";
import { localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { AutomationsFAQ } from "./components/AutomationsFAQ";
import { HowItWorks } from "./components/HowItWorks";
import { LaunchWatchDemo } from "./components/LaunchWatchDemo";
import { UseCases } from "./components/UseCases";

const VIDEO_URL = "https://www.youtube.com/watch?v=ixe-PiRJTag";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const i18n = getI18nInstance(lang);
	const title = i18n._(msg({ message: "Superset Automations" }));
	const description = i18n._(
		msg({
			message:
				"Write a prompt and pick an event or a schedule, like a review request, a Slack message, a Linear issue, a Sentry issue, or a webhook. Each run opens a workspace you can review and continue.",
		}),
	);
	const image = {
		url: "/automations/og.jpg",
		width: 2400,
		height: 1257,
		alt: title,
	};
	return {
		title,
		description,
		alternates: localizedAlternates(lang, "/automations"),
		openGraph: {
			title,
			description,
			type: "website",
			url: `${COMPANY.MARKETING_URL}/automations`,
			siteName: COMPANY.NAME,
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

export default async function AutomationsPage() {
	await initServerI18n();

	return (
		<div className="overflow-x-clip">
			<main className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-8 sm:py-20">
				<section>
					<div className="max-w-3xl">
						<p className="font-mono text-brand text-xs uppercase tracking-wider">
							<Trans>Superset Automations</Trans>
						</p>
						<h1 className="mt-4 font-medium text-balance text-4xl text-foreground tracking-tight sm:text-5xl">
							<Trans>Run agents on a schedule or when something happens.</Trans>
						</h1>
						<p className="mt-5 max-w-xl text-lg text-muted-foreground leading-relaxed">
							<Trans>
								Start an agent from a schedule, an event in your tools, or a
								webhook. Each run opens a workspace you can review.
							</Trans>
						</p>
						<ProductHeroActions source="automations" docsPath="/automations" />
					</div>
					<LaunchWatchDemo />
					<a
						href={VIDEO_URL}
						target="_blank"
						rel="noopener noreferrer"
						className="mt-4 inline-flex items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
					>
						<Trans>Watch the Superset Automations video on YouTube</Trans>
						<ArrowUpRight className="size-3.5" />
					</a>
				</section>

				<section className="mt-24 sm:mt-32">
					<p className="font-mono text-brand text-xs uppercase tracking-wider">
						<Trans>How it works</Trans>
					</p>
					<h2 className="mt-4 font-medium text-3xl text-foreground tracking-tight sm:text-4xl">
						<Trans>A prompt, some triggers, and a workspace for each run</Trans>
					</h2>
					<HowItWorks />
				</section>

				<section className="mt-24 sm:mt-32">
					<p className="font-mono text-brand text-xs uppercase tracking-wider">
						<Trans>Use cases</Trans>
					</p>
					<h2 className="mt-4 font-medium text-3xl text-foreground tracking-tight sm:text-4xl">
						<Trans>What teams automate</Trans>
					</h2>
					<UseCases />
				</section>

				<AutomationsFAQ />
			</main>
			<CTASection />
		</div>
	);
}
