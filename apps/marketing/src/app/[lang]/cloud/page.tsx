import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { getI18nInstance } from "@superset/i18n/server";
import type { Metadata } from "next";
import { FaCloud } from "react-icons/fa";
import { localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { CloudGraphic } from "./components/CloudGraphic";
import { UpgradeActions } from "./components/UpgradeActions";
import { CLOUD_FEATURES } from "./constants";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const i18n = getI18nInstance(lang);
	return {
		title: i18n._(msg({ message: "Paradev cloud workspaces" })),
		description: i18n._(
			msg({
				message:
					"Run coding agents in cloud workspaces that keep working when your laptop is closed. Included with Team and Ultra.",
			}),
		),
		alternates: localizedAlternates(lang, "/cloud"),
	};
}

export default async function CloudPage() {
	await initServerI18n();
	const { t } = useLingui();

	return (
		<div className="overflow-x-clip">
			<main className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-8 sm:py-20">
				<section>
					<div className="max-w-3xl">
						<p className="inline-flex items-center gap-2 font-mono text-brand text-xs uppercase tracking-wider">
							<FaCloud aria-hidden="true" className="size-4" />
							<Trans>Cloud workspaces</Trans>
							<span className="border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
								<Trans>Beta</Trans>
							</span>
						</p>
						<h1 className="mt-4 font-medium text-balance text-4xl text-foreground tracking-tight sm:text-5xl">
							<Trans>Run your coding agents in the cloud.</Trans>
						</h1>
						<p className="mt-5 max-w-xl text-lg text-muted-foreground leading-relaxed">
							<Trans>
								Each workspace gets its own cloud machine and keeps working when
								your laptop is closed. Check in from desktop, iPhone, or iPad.
							</Trans>
						</p>
						<UpgradeActions placement="hero" />
						<p className="mt-4 text-muted-foreground text-xs">
							<Trans>Included with Team and Ultra.</Trans>
						</p>
					</div>
					<CloudGraphic />
				</section>

				<section className="mt-24 sm:mt-32">
					<h2 className="font-medium text-3xl text-foreground tracking-tight sm:text-4xl">
						<Trans>One machine per workspace.</Trans>
					</h2>
					<div className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
						{CLOUD_FEATURES.map((feature) => (
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

				<section className="mt-24 border border-border p-8 sm:mt-32 sm:p-12">
					<h2 className="font-medium text-2xl text-foreground tracking-tight sm:text-3xl">
						<Trans>Start your first cloud workspace.</Trans>
					</h2>
					<p className="mt-3 max-w-xl text-muted-foreground leading-relaxed">
						<Trans>
							Upgrade your organization, connect GitHub, and pick Cloud in the
							new-workspace screen.
						</Trans>
					</p>
					<UpgradeActions placement="footer" />
				</section>
			</main>
		</div>
	);
}
