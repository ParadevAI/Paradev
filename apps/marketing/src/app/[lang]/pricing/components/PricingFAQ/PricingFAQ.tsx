"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import type { PlanFamily } from "@superset/shared/billing";
import { useEffect } from "react";
import { FAQDisclosure } from "../../../components/FAQDisclosure";
import { PRICING_FAQ_ITEMS } from "../../constants";
import { faqAnchor } from "../../utils/faqAnchor";
import { faqAnswer } from "../../utils/faqAnswer";
import { faqShown, planPriceValues } from "../../utils/planPriceValues";

interface PricingFAQProps {
	catalog: PlanFamily[];
}

export function PricingFAQ({ catalog }: PricingFAQProps) {
	const { t, i18n } = useLingui();
	const priceValues = planPriceValues(catalog, i18n);

	useEffect(() => {
		const openFromHash = () => {
			const target = document.getElementById(window.location.hash.slice(1));
			if (target instanceof HTMLDetailsElement) target.open = true;
		};
		openFromHash();
		window.addEventListener("hashchange", openFromHash);
		return () => window.removeEventListener("hashchange", openFromHash);
	}, []);

	return (
		<div>
			<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
				<Trans>FAQ</Trans>
			</span>
			<h2 className="text-2xl md:text-3xl font-medium tracking-tight text-foreground mt-4 mb-8">
				<Trans>Common questions</Trans>
			</h2>
			<div>
				{PRICING_FAQ_ITEMS.filter((item) => faqShown(item, priceValues)).map(
					(item) => {
						const answer = faqAnswer(item, priceValues, i18n);
						return (
							<FAQDisclosure
								key={item.id}
								id={faqAnchor(item.id)}
								name="pricing-faq"
								compact
								question={t(item.question)}
							>
								<p>{answer.lead}</p>
								{answer.list.length > 0 && (
									<ul className="list-disc space-y-1 pl-5">
										{answer.list.map((line) => (
											<li key={line}>{line}</li>
										))}
									</ul>
								)}
								{answer.more.map((paragraph) => (
									<p key={paragraph}>{paragraph}</p>
								))}
							</FAQDisclosure>
						);
					},
				)}
			</div>
		</div>
	);
}
