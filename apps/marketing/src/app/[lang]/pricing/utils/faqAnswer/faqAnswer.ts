import type { I18n } from "@lingui/core";
import type { PricingFAQItem } from "../../constants";
import { faqValues, type PlanPriceValues } from "../planPriceValues";

export interface FAQAnswer {
	lead: string;
	list: string[];
	more: string[];
}

export function faqAnswer(
	item: PricingFAQItem,
	prices: PlanPriceValues,
	i18n: I18n,
): FAQAnswer {
	const values = faqValues(prices);
	return {
		lead: i18n._({ ...item.answer, values }),
		list: item.list === "allowances" ? prices.allowanceItems : [],
		more: (item.more ?? []).map((paragraph) =>
			i18n._({ ...paragraph, values }),
		),
	};
}

export function faqAnswerText({ lead, list, more }: FAQAnswer): string {
	return [list.length ? `${lead} ${list.join("; ")}.` : lead, ...more].join(
		" ",
	);
}
