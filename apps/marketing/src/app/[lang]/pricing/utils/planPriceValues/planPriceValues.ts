import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import {
	formatCurrency,
	formatList,
	formatNumber,
} from "@superset/i18n/format";
import {
	DEFAULT_MACHINE_SIZE,
	gbHourPackPricePerGbHour,
	machineSpec,
	maxYearlyDiscount,
	offersYearlyDiscount,
	PLAN_PRICE_CURRENCY,
	type PlanFamily,
	seatPricePerMonth,
} from "@superset/shared/billing";

export interface FamilyPriceSet {
	family: string;
	name: string;
	monthly: string;
	yearly: string;
	yearlyTotal: string | null;
	hasYearlyDiscount: boolean;
	gbHours: string | null;
	hours: string | null;
	overage: string | null;
	overageRate: string | null;
	environments: string | null;
	pack: string | null;
	previousName: string | null;
}

export interface PlanPriceValues {
	families: FamilyPriceSet[];
	byFamily: Record<string, FamilyPriceSet>;
	maxDiscount: string | null;
	fromPrice: string | null;
	planPrices: string;
	allowanceItems: string[];
	overagePrice: string | null;
	packPrice: string | null;
}

const YEARLY_PRICE_ITEM = msg({
	message: "{name}: {monthly} per user/month, or {yearly} billed yearly",
});
const MONTHLY_PRICE_ITEM = msg({
	message: "{name}: {monthly} per user/month",
});
const ALLOWANCE_ITEM = msg({
	message: "{name}: {hours} hours ({gbHours} GB-hours) per seat",
});
const PACK_ITEM = msg({ message: "{price} per GB-hour" });

export function planPriceValues(
	catalog: PlanFamily[],
	i18n: I18n,
): PlanPriceValues {
	const locale = i18n.locale;
	const currency = (value: number) =>
		formatCurrency(
			value,
			PLAN_PRICE_CURRENCY,
			{ minimumFractionDigits: 0, maximumFractionDigits: 2 },
			locale,
		);
	const number = (value: number, digits: number) =>
		formatNumber(value, { maximumFractionDigits: digits }, locale);
	const standardBox = machineSpec(DEFAULT_MACHINE_SIZE);
	const firstPack = catalog.find((family) => family.pack)?.pack;
	const perGbHour = (value: number) =>
		i18n._({ ...PACK_ITEM, values: { price: currency(value) } });
	const families = catalog.map((family, index): FamilyPriceSet => {
		const hasYearlyDiscount = offersYearlyDiscount(family);
		return {
			family: family.family,
			name: family.name,
			monthly: currency(seatPricePerMonth(family, false)),
			yearly: currency(seatPricePerMonth(family, true)),
			yearlyTotal:
				hasYearlyDiscount && family.yearly
					? currency(family.yearly.seatPrice)
					: null,
			hasYearlyDiscount,
			gbHours: family.gbMinutesPerSeat
				? number(family.gbMinutesPerSeat / 60, 0)
				: null,
			hours: family.gbMinutesPerSeat
				? number(family.gbMinutesPerSeat / 60 / standardBox.memoryGb, 0)
				: null,
			overage:
				family.overagePerGbHour == null
					? null
					: currency(family.overagePerGbHour),
			overageRate:
				family.gbMinutesPerSeat && family.overagePerGbHour != null
					? perGbHour(family.overagePerGbHour)
					: null,
			environments: family.environments ? number(family.environments, 0) : null,
			pack: family.pack
				? perGbHour(gbHourPackPricePerGbHour(family.pack))
				: null,
			previousName: catalog[index - 1]?.name ?? null,
		};
	});
	const discount = maxYearlyDiscount(catalog);
	const cheapest = Math.min(
		...catalog.map((family) => seatPricePerMonth(family, true)),
	);
	return {
		families,
		byFamily: Object.fromEntries(families.map((set) => [set.family, set])),
		maxDiscount:
			discount > 0
				? formatNumber(
						discount,
						{ style: "percent", maximumFractionDigits: 0 },
						locale,
					)
				: null,
		fromPrice: Number.isFinite(cheapest) ? currency(cheapest) : null,
		planPrices: formatList(
			families.map((set) =>
				i18n._({
					...(set.hasYearlyDiscount ? YEARLY_PRICE_ITEM : MONTHLY_PRICE_ITEM),
					values: { name: set.name, monthly: set.monthly, yearly: set.yearly },
				}),
			),
			{ type: "conjunction" },
			locale,
		),
		allowanceItems: families
			.filter((set) => set.gbHours)
			.map((set) =>
				i18n._({
					...ALLOWANCE_ITEM,
					values: { hours: set.hours, gbHours: set.gbHours, name: set.name },
				}),
			),
		overagePrice:
			families.find((set) => set.gbHours)?.overage ??
			families[0]?.overage ??
			null,
		packPrice: firstPack ? currency(gbHourPackPricePerGbHour(firstPack)) : null,
	};
}

export function featureValues(set: FamilyPriceSet | undefined) {
	const standardBox = machineSpec(DEFAULT_MACHINE_SIZE);
	return {
		gbHours: set?.gbHours ?? "",
		hours: set?.hours ?? "",
		previousPlan: set?.previousName ?? "",
		vcpus: standardBox.vcpus,
		memoryGb: standardBox.memoryGb,
	};
}

/** A feature that depends on cloud values shows only when the plan has them. */
export function featureShown(
	feature: { needs?: "gbHours" },
	set: FamilyPriceSet | undefined,
): boolean {
	return !feature.needs || Boolean(featureValues(set)[feature.needs]);
}

export function faqValues(values: PlanPriceValues) {
	const standardBox = machineSpec(DEFAULT_MACHINE_SIZE);
	return {
		vcpus: standardBox.vcpus,
		memoryGb: standardBox.memoryGb,
		planPrices: values.planPrices,
		overagePrice: values.overagePrice,
		packPrice: values.packPrice,
	};
}

export function faqShown(
	item: { needs?: "prices" | "gbHours" | "pack" },
	values: PlanPriceValues,
): boolean {
	if (!item.needs) return true;
	const needed = {
		prices: values.planPrices,
		gbHours: values.allowanceItems.length > 0,
		pack: values.packPrice,
	}[item.needs];
	return Boolean(needed);
}
