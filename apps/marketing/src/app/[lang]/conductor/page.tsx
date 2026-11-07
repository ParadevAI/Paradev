import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { formatDate } from "@superset/i18n/format";
import { getI18nInstance } from "@superset/i18n/server";
import { BRAND } from "@superset/shared/brand";
import type { Metadata } from "next";
import Link from "next/link";
import { HiCheck, HiXMark } from "react-icons/hi2";
import { DownloadLink } from "@/app/[lang]/components/DownloadLink";
import { FAQDisclosure } from "@/app/[lang]/components/FAQDisclosure";
import { localeUrl, localizedAlternates } from "@/app/[lang]/metadata";
import { fetchPlanCatalog } from "@/app/[lang]/pricing/utils/fetchPlanCatalog";
import { planPriceValues } from "@/app/[lang]/pricing/utils/planPriceValues";
import { initServerI18n } from "@/app/i18n-server";
import { FAQPageJsonLd } from "@/components/JsonLd";
import { SwitchActions } from "./components/SwitchActions";
import {
	COMPARE_PATH,
	COMPARISON_ROWS,
	CONDUCTOR_ANNOUNCEMENT_URL,
	DOES_NOT_TRANSFER,
	FAQ_ITEMS,
	HIGHLIGHTS,
	MIGRATE_CLOUD_URL,
	MIGRATION_STEPS,
	SHUTDOWN_DATE,
	TIMELINE,
	TRANSFERS,
} from "./constants";

const PATH = "/conductor";
const TITLE = msg({
	message: "Conductor Cloud ends {shutdownDate}. Switch to {companyName}",
});
const DESCRIPTION = msg({
	message:
		"Conductor Cloud shuts down on {shutdownDateLong}. Move your worktrees and agents to {companyName} in a few minutes. Free and open source.",
});

function dayLabel(date: Date, locale: string, withYear = false): string {
	return formatDate(
		date,
		withYear
			? { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }
			: { month: "long", day: "numeric", timeZone: "UTC" },
		locale,
	);
}

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const i18n = getI18nInstance(lang);
	const values = {
		companyName: BRAND.NAME,
		shutdownDate: dayLabel(SHUTDOWN_DATE, lang),
		shutdownDateLong: dayLabel(SHUTDOWN_DATE, lang, true),
	};
	const title = i18n._({ ...TITLE, values });
	const description = i18n._({ ...DESCRIPTION, values });
	return {
		title: { absolute: title },
		description,
		alternates: localizedAlternates(lang, PATH),
		openGraph: {
			title,
			description,
			type: "website",
			url: localeUrl(lang, PATH),
			siteName: BRAND.NAME,
		},
		twitter: {
			card: "summary_large_image",
			title,
			description,
		},
	};
}

export default async function ConductorPage() {
	const lang = await initServerI18n();
	const i18n = getI18nInstance(lang);
	const prices = planPriceValues(await fetchPlanCatalog(), i18n);
	const proPrice = prices.byFamily.pro?.monthly;
	const teamPrice = prices.byFamily.team?.monthly;
	const shutdownDate = dayLabel(SHUTDOWN_DATE, lang);
	const values = { companyName: BRAND.NAME, shutdownDate, proPrice, teamPrice };
	const t = (descriptor: MessageDescriptor) =>
		i18n._({ ...descriptor, values });
	const priced = (
		descriptor: MessageDescriptor,
		unpriced?: MessageDescriptor,
	) => (unpriced && !(proPrice && teamPrice) ? t(unpriced) : t(descriptor));
	const faqItems = FAQ_ITEMS.map((item) => ({
		id: item.id,
		question: t(item.question),
		answer: priced(item.answer, item.unpricedAnswer),
		link: item.link && { label: t(item.link.label), href: item.link.href },
	}));

	return (
		<div className="overflow-x-clip">
			<FAQPageJsonLd items={faqItems} />
			<main className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-8 sm:py-20">
				<section className="max-w-3xl">
					<p className="font-mono text-brand text-xs uppercase tracking-wider">
						For Conductor users
					</p>
					<h1 className="mt-4 text-balance font-medium text-4xl text-foreground tracking-tight sm:text-6xl">
						<Trans>
							Conductor Cloud ends {shutdownDate}. Move to {BRAND.NAME} in
							minutes.
						</Trans>
					</h1>
					<p className="mt-5 max-w-xl text-lg text-muted-foreground leading-relaxed">
						<Trans>
							{BRAND.NAME} is open source, so you're never locked in. Run
							parallel agents the way you're used to, with chat, cloud and
							mobile built in.
						</Trans>
					</p>
					<SwitchActions placement="hero" />
					<p className="mt-4 text-muted-foreground text-xs">
						<Trans>Free for one user. Open source under MIT.</Trans>
					</p>
				</section>

				<section
					aria-label={i18n._(msg({ message: "What you get" }))}
					className="mt-16 sm:mt-20"
				>
					<ul className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
						{HIGHLIGHTS.map((item) => (
							<li key={item.title.id} className="bg-background p-6">
								<h2 className="flex flex-wrap items-center gap-2 font-medium text-foreground">
									{t(item.title)}
								</h2>
								<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
									{t(item.detail)}
								</p>
							</li>
						))}
					</ul>
				</section>

				<section className="mt-24 sm:mt-32" aria-labelledby="timeline">
					<h2
						id="timeline"
						className="font-medium text-3xl text-foreground tracking-tight sm:text-4xl"
					>
						<Trans>Key dates</Trans>
					</h2>
					<p className="mt-3 max-w-2xl text-muted-foreground leading-relaxed">
						<Trans>
							Congrats to the Conductor team on joining Meta. Dates are from{" "}
							<a
								href={CONDUCTOR_ANNOUNCEMENT_URL}
								className="text-foreground underline underline-offset-4 hover:text-brand"
							>
								their announcement
							</a>
							.
						</Trans>
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
									{entry.date
										? dayLabel(entry.date, lang)
										: entry.dateLabel && t(entry.dateLabel)}
								</time>
								<h3 className="mt-2 font-medium text-foreground">
									{t(entry.title)}
								</h3>
								<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
									{t(entry.detail)}
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
						<Trans>Switch in four steps</Trans>
					</h2>
					<p className="mt-3 max-w-2xl text-muted-foreground leading-relaxed">
						<Trans>
							Conductor workspaces are plain Git worktrees. {BRAND.NAME} uses
							them where they are.
						</Trans>
					</p>
					<ol className="mt-10 border-border border-t">
						{MIGRATION_STEPS.map((step, index) => (
							<li
								key={step.title.id}
								className="grid gap-2 border-border border-b py-6 sm:grid-cols-[4rem_1fr] sm:gap-6"
							>
								<span className="font-mono text-muted-foreground text-sm">
									{String(index + 1).padStart(2, "0")}
								</span>
								<div>
									<h3 className="flex flex-wrap items-center gap-2 font-medium text-foreground text-lg">
										{t(step.title)}
										{step.optional && (
											<span className="border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
												<Trans>Optional</Trans>
											</span>
										)}
									</h3>
									<p className="mt-2 max-w-2xl text-muted-foreground leading-relaxed">
										{t(step.detail)}
									</p>
									{step.download && (
										<DownloadLink
											source="conductor"
											className="mt-4 inline-block bg-foreground px-5 py-2.5 font-medium text-background text-sm transition-opacity hover:opacity-90"
										>
											<Trans>Download {BRAND.NAME}</Trans>
										</DownloadLink>
									)}
									{step.link && (
										<a
											href={step.link.href}
											className="mt-3 inline-block text-foreground text-sm underline underline-offset-4 hover:text-brand"
										>
											{t(step.link.label)}
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
						<Trans>Side by side</Trans>
					</h2>
					<div className="mt-10 overflow-x-auto">
						<table className="w-full min-w-[36rem] border-collapse text-left text-sm">
							<thead>
								<tr className="border-border border-b">
									<th scope="col" className="w-1/5 py-3 pr-4 font-normal">
										<span className="sr-only">
											<Trans>Feature</Trans>
										</span>
									</th>
									<th
										scope="col"
										className="py-3 pr-4 font-medium text-foreground"
									>
										{BRAND.NAME}
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
									<tr key={row.id} className="border-border border-b">
										<th
											scope="row"
											className="py-4 pr-4 align-top font-normal text-muted-foreground"
										>
											{t(row.label)}
										</th>
										<td className="py-4 pr-4 align-top text-foreground">
											{priced(row.paradev, row.unpricedParadev)}
										</td>
										<td className="py-4 align-top text-muted-foreground">
											{t(row.conductor)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<p className="mt-4 text-muted-foreground text-sm">
						<Trans>
							Conductor details are from its public docs. See the{" "}
							<Link
								href={COMPARE_PATH}
								className="text-foreground underline underline-offset-4 hover:text-brand"
							>
								full comparison
							</Link>
							.
						</Trans>
					</p>
				</section>

				<section className="mt-24 sm:mt-32" aria-labelledby="transfer">
					<h2
						id="transfer"
						className="font-medium text-3xl text-foreground tracking-tight sm:text-4xl"
					>
						<Trans>What comes with you</Trans>
					</h2>

					<div className="mt-10 grid gap-10 md:grid-cols-2">
						<div>
							<h3 className="font-medium text-foreground">
								<Trans>Comes with you</Trans>
							</h3>
							<ul className="mt-4 space-y-3">
								{TRANSFERS.map((item) => (
									<li
										key={item.id}
										className="flex gap-3 text-muted-foreground text-sm leading-relaxed"
									>
										<HiCheck
											aria-hidden="true"
											className="mt-0.5 size-4 shrink-0 text-brand"
										/>
										{t(item)}
									</li>
								))}
							</ul>
						</div>
						<div>
							<h3 className="font-medium text-foreground">
								<Trans>Stays behind</Trans>
							</h3>
							<ul className="mt-4 space-y-3">
								{DOES_NOT_TRANSFER.map((item) => (
									<li
										key={item.id}
										className="flex gap-3 text-muted-foreground text-sm leading-relaxed"
									>
										<HiXMark
											aria-hidden="true"
											className="mt-0.5 size-4 shrink-0"
										/>
										{t(item)}
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
						<Trans>FAQ</Trans>
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
					<h2 className="font-medium text-3xl text-foreground tracking-tight sm:text-4xl">
						<Trans>Move your agents before {shutdownDate}.</Trans>
					</h2>
					<p className="mt-3 max-w-xl text-muted-foreground leading-relaxed">
						<Trans>
							It takes a few minutes. On Conductor Cloud? Start with the{" "}
							<a
								href={MIGRATE_CLOUD_URL}
								className="text-foreground underline underline-offset-4 hover:text-brand"
							>
								cloud guide
							</a>
							.
						</Trans>
					</p>
					<SwitchActions placement="footer" />
					<p className="mt-6 text-muted-foreground text-xs">
						<Trans>
							Conductor is a trademark of its owner. {BRAND.NAME} is not
							affiliated with or endorsed by Conductor or Meta.
						</Trans>
					</p>
				</section>
			</main>
		</div>
	);
}
