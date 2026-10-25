"use client";

import { useLingui } from "@lingui/react/macro";
import type { PlanFamily } from "@superset/shared/billing";
import { useState } from "react";
import { pricingTiers } from "../../constants";
import { planPriceValues } from "../../utils/planPriceValues";
import { BillingToggle } from "./components/BillingToggle";
import { PricingCard } from "./components/PricingCard";

const GRID_COLUMNS: Record<number, string> = {
	2: "xl:grid-cols-2",
	3: "xl:grid-cols-3",
	4: "xl:grid-cols-4",
	5: "xl:grid-cols-5",
	6: "xl:grid-cols-6",
};

interface PricingTiersProps {
	catalog: PlanFamily[];
}

export function PricingTiers({ catalog }: PricingTiersProps) {
	const { i18n } = useLingui();
	const [isYearly, setIsYearly] = useState(true);
	const values = planPriceValues(catalog, i18n);
	const tiers = pricingTiers(catalog);
	const columns = GRID_COLUMNS[Math.min(6, tiers.length)] ?? "";

	return (
		<div className="flex flex-col gap-10">
			{values.maxDiscount && (
				<div className="flex justify-center">
					<BillingToggle
						isYearly={isYearly}
						onChange={setIsYearly}
						maxDiscount={values.maxDiscount}
					/>
				</div>
			)}
			<div
				className={`grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 ${columns}`}
			>
				{tiers.map((tier) => (
					<PricingCard
						key={tier.id}
						tier={tier}
						isYearly={isYearly}
						values={values}
						wide={tier.price.kind === "custom" && tiers.length % 2 === 1}
					/>
				))}
			</div>
		</div>
	);
}
