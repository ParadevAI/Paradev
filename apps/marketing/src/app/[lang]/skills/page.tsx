import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { getI18nInstance } from "@superset/i18n/server";
import { BRAND } from "@superset/shared/brand";
import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { loadSkillCatalog } from "./utils/loadSkillCatalog";

const DESCRIPTION = msg({
	message:
		"Each skill is a SKILL.md file that a coding agent loads when a task needs it. Agents find all of them in the discovery index.",
});

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const i18n = getI18nInstance(lang);
	const title = i18n._(msg({ message: "Paradev Skills" }));
	const description = i18n._(DESCRIPTION);
	return {
		title,
		description,
		alternates: localizedAlternates(lang, "/skills"),
		openGraph: {
			title,
			description,
			type: "website",
			url: `${COMPANY.MARKETING_URL}/skills`,
			siteName: BRAND.NAME,
		},
	};
}

export default async function SkillsPage() {
	await initServerI18n();
	const skills = await loadSkillCatalog();

	return (
		<main className="mx-auto w-full max-w-4xl px-6 py-12 sm:px-8 sm:py-20">
			<p className="font-mono text-brand text-xs uppercase tracking-wider">
				<Trans>Paradev Skills</Trans>
			</p>
			<h1 className="mt-4 font-medium text-balance text-4xl text-foreground tracking-tight sm:text-5xl">
				<Trans>Skills that teach agents to use Paradev.</Trans>
			</h1>
			<p className="mt-5 max-w-2xl text-lg text-muted-foreground leading-relaxed">
				<Trans>
					Each skill is a SKILL.md file that a coding agent loads when a task
					needs it. Agents find all of them in the discovery index.
				</Trans>
			</p>
			<a
				href="/.well-known/agent-skills/index.json"
				className="mt-6 inline-block font-mono text-foreground text-sm underline underline-offset-4"
			>
				<Trans>Discovery index</Trans>
			</a>
			<ul className="mt-12 divide-y divide-border border-border border-y">
				{skills.map((skill) => (
					<li
						key={skill.name}
						className="grid gap-1 py-4 sm:grid-cols-[14rem_1fr] sm:gap-6"
					>
						<a
							href={skill.url}
							className="font-mono text-foreground text-sm underline-offset-4 hover:underline"
						>
							{skill.name}
						</a>
						<p className="text-muted-foreground text-sm leading-relaxed">
							{skill.summary}
						</p>
					</li>
				))}
			</ul>
		</main>
	);
}
