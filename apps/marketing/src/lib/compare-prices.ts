import type { SupportedLocale } from "@superset/i18n";
import type { PlanFamily } from "@superset/shared/billing";
import { fetchPlanCatalog } from "@/app/[lang]/pricing/utils/fetchPlanCatalog";
import { getComparisonPage, getComparisonPages } from "./compare";
import type { ComparisonPage } from "./compare-utils";
import { fillPlanPrices } from "./plan-prices";

function fillPage(page: ComparisonPage, catalog: PlanFamily[]): ComparisonPage {
	return {
		...page,
		title: fillPlanPrices(page.title, catalog),
		description: fillPlanPrices(page.description, catalog),
		content: fillPlanPrices(page.content, catalog),
	};
}

export async function getPricedComparisonPage(
	slug: string,
	locale: SupportedLocale = "en",
): Promise<ComparisonPage | undefined> {
	const page = getComparisonPage(slug, locale);
	return page && fillPage(page, await fetchPlanCatalog());
}

export async function getPricedComparisonPages(
	locale: SupportedLocale = "en",
): Promise<ComparisonPage[]> {
	const catalog = await fetchPlanCatalog();
	return getComparisonPages(locale).map((page) => fillPage(page, catalog));
}
