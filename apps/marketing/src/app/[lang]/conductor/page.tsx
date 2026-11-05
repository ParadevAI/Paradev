import { BRAND } from "@superset/shared/brand";
import type { Metadata } from "next";
import Link from "next/link";
import { HiCheck, HiXMark } from "react-icons/hi2";
import { FAQDisclosure } from "@/app/[lang]/components/FAQDisclosure";
import { localeUrl, localizedAlternates } from "@/app/[lang]/metadata";
import { fetchPlanCatalog } from "@/app/[lang]/pricing/utils/fetchPlanCatalog";
import { initServerI18n } from "@/app/i18n-server";
import { FAQPageJsonLd } from "@/components/JsonLd";
import { fillPlanPrices } from "@/lib/plan-prices";
import { SwitchActions } from "./components/SwitchActions";
import {
	COMPARE_PATH,
	COMPARISON_ROWS,
	CONDUCTOR_ANNOUNCEMENT_URL,
	DOES_NOT_TRANSFER,
	FAQ_ITEMS,
	MIGRATE_CLOUD_URL,
	MIGRATION_STEPS,
	TIMELINE,
	TRANSFERS,
} from "./constants";

const PATH = "/conductor";
const TITLE = "Conductor Cloud is shutting down — switch to Paradev";
const DESCRIPTION =
	"Conductor Cloud goes read-only on November 13 and shuts down on November 20, 2026. Move your worktrees and agents to Paradev (formerly Superset), the open-source app for parallel coding agents.";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	return {
		title: { absolute: TITLE },
		description: DESCRIPTION,
		alternates: localizedAlternates(lang, PATH),
		openGraph: {
			title: TITLE,
			description: DESCRIPTION,
			type: "website",
			url: localeUrl("en", PATH),
			siteName: BRAND.NAME,
		},
		twitter: {
			card: "summary_large_image",
			title: TITLE,
			description: DESCRIPTION,
		},
	};
}

export default async function ConductorPage() {
	await initServerI18n();
	const catalog = await fetchPlanCatalog();
	const priced = (text: string, unpriced?: string) =>
		catalog.length === 0 && unpriced ? unpriced : fillPlanPrices(text, catalog);
	const faqItems = FAQ_ITEMS.map((item) => ({
		...item,
		answer: priced(item.answer, item.unpricedAnswer),
	}));

	return (
		<div className="overflow-x-clip">
			<FAQPageJsonLd items={faqItems} />
			<main className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-8 sm:py-20">
				<section className="max-w-3xl">
					<p className="font-mono text-brand text-xs uppercase tracking-wider">
						For Conductor users
					</p>
					<h1 className="mt-4 text-balance font-medium text-4xl text-foreground tracking-tight sm:text-5xl">
						Conductor Cloud is shutting down. Bring your agents to Paradev.
					</h1>
					<p className="mt-5 max-w-xl text-lg text-muted-foreground leading-relaxed">
						Conductor Cloud goes read-only on{" "}
						<strong className="font-medium text-foreground">November 13</strong>{" "}
						and deletes data after{" "}
						<strong className="font-medium text-foreground">
							November 20, 2026
						</strong>
						. {BRAND.INTRO_NAME} runs the same model you know: parallel coding
						agents, each in its own Git worktree and branch.
					</p>
					<SwitchActions placement="hero" />
					<p className="mt-4 text-muted-foreground text-xs">
						Free for one user. Open source under the MIT License.
					</p>
				</section>

				<section className="mt-24 sm:mt-32" aria-labelledby="timeline">
					<h2
						id="timeline"
						className="font-medium text-3xl text-foreground tracking-tight sm:text-4xl"
					>
						The dates that matter
					</h2>
					<p className="mt-3 max-w-2xl text-muted-foreground leading-relaxed">
						Congratulations to the Conductor team on joining Meta. Here is what
						changes for people who use Conductor today, from{" "}
						<a
							href={CONDUCTOR_ANNOUNCEMENT_URL}
							className="text-foreground underline underline-offset-4 hover:text-brand"
						>
							Conductor's announcement
						</a>
						.
					</p>
					<ol className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
						{TIMELINE.map((entry) => (
							<li
								key={entry.dateTime}
								className={`border-t pt-4 ${entry.urgent ? "border-brand" : "border-border"}`}
							>
								<time
									dateTime={entry.dateTime}
									className={`font-mono text-xs uppercase tracking-wider ${entry.urgent ? "text-brand" : "text-muted-foreground"}`}
								>
									{entry.date}
								</time>
								<h3 className="mt-2 font-medium text-foreground">
									{entry.title}
								</h3>
								<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
									{entry.detail}
								</p>
							</li>
						))}
					</ol>
				</section>

				<section
					id="migrate"
					className="mt-24 scroll-mt-24 sm:mt-32"
					aria-labelledby="migrate-heading"
				>
					<h2
						id="migrate-heading"
						className="font-medium text-3xl text-foreground tracking-tight sm:text-4xl"
					>
						Move in about five minutes
					</h2>
					<p className="mt-3 max-w-2xl text-muted-foreground leading-relaxed">
						Your Conductor workspaces are ordinary Git worktrees, so Paradev
						adopts them where they are.
					</p>
					<ol className="mt-10 border-border border-t">
						{MIGRATION_STEPS.map((step, index) => (
							<li
								key={step.title}
								className="grid gap-2 border-border border-b py-6 sm:grid-cols-[4rem_1fr] sm:gap-6"
							>
								<span className="font-mono text-muted-foreground text-sm">
									{String(index + 1).padStart(2, "0")}
								</span>
								<div>
									<h3 className="flex flex-wrap items-center gap-2 font-medium text-foreground text-lg">
										{step.title}
										{step.optional && (
											<span className="border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
												Optional · Beta
											</span>
										)}
									</h3>
									<p className="mt-2 max-w-2xl text-muted-foreground leading-relaxed">
										{step.detail}
									</p>
									{step.link && (
										<a
											href={step.link.href}
											className="mt-3 inline-block text-foreground text-sm underline underline-offset-4 hover:text-brand"
										>
											{step.link.label}
										</a>
									)}
								</div>
							</li>
						))}
					</ol>
				</section>

				<section className="mt-24 sm:mt-32" aria-labelledby="compare">
					<h2
						id="compare"
						className="font-medium text-3xl text-foreground tracking-tight sm:text-4xl"
					>
						Conductor and Paradev side by side
					</h2>
					<div className="mt-10 overflow-x-auto">
						<table className="w-full min-w-[36rem] border-collapse text-left text-sm">
							<thead>
								<tr className="border-border border-b">
									<th scope="col" className="w-1/5 py-3 pr-4 font-normal">
										<span className="sr-only">Feature</span>
									</th>
									<th
										scope="col"
										className="py-3 pr-4 font-medium text-foreground"
									>
										Paradev
									</th>
									<th
										scope="col"
										className="py-3 font-medium text-muted-foreground"
									>
										Conductor
									</th>
								</tr>
							</thead>
							<tbody>
								{COMPARISON_ROWS.map((row) => (
									<tr key={row.label} className="border-border border-b">
										<th
											scope="row"
											className="py-4 pr-4 align-top font-normal text-muted-foreground"
										>
											{row.label}
										</th>
										<td className="py-4 pr-4 align-top text-foreground">
											{priced(row.paradev, row.unpricedParadev)}
											{row.beta && (
												<span className="ml-2 border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
													Beta
												</span>
											)}
										</td>
										<td className="py-4 align-top text-muted-foreground">
											{row.conductor}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<p className="mt-4 text-muted-foreground text-sm">
						Conductor details come from Conductor's public documentation and
						announcement. Read the{" "}
						<Link
							href={COMPARE_PATH}
							className="text-foreground underline underline-offset-4 hover:text-brand"
						>
							full comparison
						</Link>
						.
					</p>
				</section>

				<section className="mt-24 sm:mt-32" aria-labelledby="transfer">
					<h2
						id="transfer"
						className="font-medium text-3xl text-foreground tracking-tight sm:text-4xl"
					>
						What comes with you
					</h2>
					<div className="mt-10 grid gap-10 md:grid-cols-2">
						<div>
							<h3 className="font-medium text-foreground">Transfers</h3>
							<ul className="mt-4 space-y-3">
								{TRANSFERS.map((item) => (
									<li
										key={item}
										className="flex gap-3 text-muted-foreground text-sm leading-relaxed"
									>
										<HiCheck
											aria-hidden="true"
											className="mt-0.5 size-4 shrink-0 text-brand"
										/>
										{item}
									</li>
								))}
							</ul>
						</div>
						<div>
							<h3 className="font-medium text-foreground">Does not transfer</h3>
							<ul className="mt-4 space-y-3">
								{DOES_NOT_TRANSFER.map((item) => (
									<li
										key={item}
										className="flex gap-3 text-muted-foreground text-sm leading-relaxed"
									>
										<HiXMark
											aria-hidden="true"
											className="mt-0.5 size-4 shrink-0"
										/>
										{item}
									</li>
								))}
							</ul>
						</div>
					</div>
				</section>

				<section className="mt-24 sm:mt-32" aria-labelledby="faq">
					<h2
						id="faq"
						className="font-medium text-3xl text-foreground tracking-tight sm:text-4xl"
					>
						Questions from Conductor users
					</h2>
					<div className="mt-8 max-w-3xl border-border border-t">
						{faqItems.map((item) => (
							<FAQDisclosure
								key={item.id}
								id={item.id}
								name="conductor-faq"
								question={item.question}
							>
								<p>{item.answer}</p>
								{item.link && (
									<a
										href={item.link.href}
										className="inline-block text-foreground text-sm underline underline-offset-4 hover:text-brand"
									>
										{item.link.label}
									</a>
								)}
							</FAQDisclosure>
						))}
					</div>
				</section>

				<section className="mt-24 border border-border p-8 sm:mt-32 sm:p-12">
					<h2 className="font-medium text-2xl text-foreground tracking-tight sm:text-3xl">
						Keep your agents running.
					</h2>
					<p className="mt-3 max-w-xl text-muted-foreground leading-relaxed">
						Install Paradev, import your Conductor worktrees, and pick up where
						you left off. Using Conductor Cloud? Start with the{" "}
						<a
							href={MIGRATE_CLOUD_URL}
							className="text-foreground underline underline-offset-4 hover:text-brand"
						>
							cloud guide
						</a>{" "}
						before November 20.
					</p>
					<SwitchActions placement="footer" />
					<p className="mt-6 text-muted-foreground text-xs">
						Conductor is a trademark of its owner. Paradev is not affiliated
						with or endorsed by Conductor or Meta.
					</p>
				</section>
			</main>
		</div>
	);
}
