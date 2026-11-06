import { msg } from "@lingui/core/macro";
import { getI18nInstance } from "@superset/i18n/server";
import { BRAND } from "@superset/shared/brand";
import type { Metadata } from "next";
import { localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { FAQPageJsonLd } from "@/components/JsonLd";
import { ComparisonTable } from "./components/ComparisonTable";
import { PricingFAQ } from "./components/PricingFAQ";
import { PricingHero } from "./components/PricingHero";
import { PricingTiers } from "./components/PricingTiers";
import { TrustStrip } from "./components/TrustStrip";
import { PRICING_FAQ_ITEMS } from "./constants";
import { faqAnswer, faqAnswerText } from "./utils/faqAnswer";
import { fetchPlanCatalog } from "./utils/fetchPlanCatalog";
import { faqShown, planPriceValues } from "./utils/planPriceValues";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const i18n = getI18nInstance(lang);
	const { fromPrice } = planPriceValues(await fetchPlanCatalog(), i18n);
	return {
		title: i18n._(
			msg({
				message: "Pricing",
			}),
		),
		description: fromPrice
			? i18n._({
					...msg({
						message:
							"Simple pricing for every team. Free for individuals, {yearlyPrice}/user/month for teams, custom for enterprise. Run 100+ parallel coding agents with {companyName}.",
					}),
					values: { companyName: BRAND.NAME, yearlyPrice: fromPrice },
				})
			: i18n._({
					...msg({
						message:
							"Simple pricing for every team. Free for individuals, per-user plans for teams, custom for enterprise. Run 100+ parallel coding agents with {companyName}.",
					}),
					values: { companyName: BRAND.NAME },
				}),
		alternates: localizedAlternates(lang, "/pricing"),
	};
}

export default async function PricingPage() {
	const locale = await initServerI18n();
	const i18n = getI18nInstance(locale);

	// JSON-LD is machine-facing, so it gets rendered strings rather than the
	// message descriptors the UI components resolve through Lingui.
	const catalog = await fetchPlanCatalog();
	const priceValues = planPriceValues(catalog, i18n);
	const faqJsonLdItems = PRICING_FAQ_ITEMS.filter((item) =>
		faqShown(item, priceValues),
	).map((item) => ({
		question: i18n._(item.question),
		answer: faqAnswerText(faqAnswer(item, priceValues, i18n)),
	}));

	return (
		<main className="relative min-h-screen">
			<FAQPageJsonLd items={faqJsonLdItems} />
			<PricingHero />

			<section className="relative border-b border-border">
				<div className="max-w-[88rem] mx-auto px-6 py-12 md:py-16">
					<PricingTiers catalog={catalog} />
				</div>
			</section>

			<section className="relative border-b border-border">
				<div className="max-w-6xl mx-auto px-6 py-10 md:py-12">
					<TrustStrip />
				</div>
			</section>

			<section className="relative border-b border-border">
				<div className="max-w-7xl mx-auto px-6 py-12 md:py-16">
					<ComparisonTable catalog={catalog} />
				</div>
			</section>

			<section className="relative">
				<div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
					<PricingFAQ catalog={catalog} />
				</div>
			</section>
		</main>
	);
}
