import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { getI18nInstance } from "@superset/i18n/server";
import {
	FIRST_PARTY_MANIFESTS,
	PLUGIN_CATEGORIES,
} from "@superset/shared/plugins";
import type { Metadata } from "next";
import { SubmitPluginActions } from "@/app/[lang]/components/SubmitPluginActions";
import { localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { PluginRow } from "./components/PluginRow";
import { CATEGORY_LABELS } from "./constants";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const i18n = getI18nInstance(lang);
	return {
		title: i18n._(msg({ message: "Plugins" })),
		description: i18n._(
			msg({
				message:
					"Browse the plugins every Paradev agent can use, and submit your own.",
			}),
		),
		alternates: localizedAlternates(lang, "/marketplace/plugins"),
	};
}

const manifests = Object.values(FIRST_PARTY_MANIFESTS);

const groups = PLUGIN_CATEGORIES.map((category) => ({
	category,
	plugins: manifests
		.filter(
			(manifest) =>
				manifest.extensions.superset.interface.category === category,
		)
		.sort((a, b) =>
			a.extensions.superset.interface.displayName.localeCompare(
				b.extensions.superset.interface.displayName,
			),
		),
})).filter((group) => group.plugins.length > 0);

export default async function MarketplacePluginsPage() {
	await initServerI18n();

	const { t } = useLingui();

	return (
		<main className="min-h-screen">
			<div className="mx-auto max-w-4xl px-6 py-10">
				<div className="mb-8">
					<h1 className="text-xl font-semibold text-foreground md:text-2xl">
						<Trans>Plugins</Trans>
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						<Trans>
							Install a plugin in the Paradev app and every agent can use it.
						</Trans>
					</p>
				</div>

				<div className="mb-10 border border-border px-4 py-5">
					<p className="font-medium text-foreground text-sm">
						<Trans>Built a plugin? Submit it here.</Trans>
					</p>
					<p className="mt-1 mb-4 text-muted-foreground text-sm">
						<Trans>
							Open a pull request that adds it to the Paradev repository. We
							review it and add it to the marketplace.
						</Trans>
					</p>
					<SubmitPluginActions />
				</div>

				<div className="space-y-8">
					{groups.map((group) => (
						<section key={group.category}>
							<h2 className="mb-2 font-medium text-foreground text-sm">
								{t(CATEGORY_LABELS[group.category])}
							</h2>
							<ul className="divide-y divide-border border border-border">
								{group.plugins.map((manifest) => (
									<PluginRow
										key={manifest.name}
										name={manifest.name}
										displayName={
											manifest.extensions.superset.interface.displayName
										}
										description={manifest.description}
										version={manifest.version}
									/>
								))}
							</ul>
						</section>
					))}
				</div>
			</div>
		</main>
	);
}
