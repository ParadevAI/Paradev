import { formatCurrency, getActiveLocale } from "@superset/i18n/format";

/** How many decimals the currency has: 2 for usd, 0 for jpy. */
export function currencyDigits(currency: string): number {
	return (
		new Intl.NumberFormat(getActiveLocale(), {
			style: "currency",
			currency: currency.toUpperCase(),
		}).resolvedOptions().maximumFractionDigits ?? 2
	);
}

/** "$20.00" from 2000 usd: Stripe holds an amount in the currency's smallest unit. */
export function stripeMoney(amount: number, currency: string): string {
	return formatCurrency(amount / 10 ** currencyDigits(currency), currency);
}

/** "$20.00 USD", as Stripe writes an amount to pay. */
export function stripeMoneyWithCode(amount: number, currency: string): string {
	return `${stripeMoney(amount, currency)} ${currency.toUpperCase()}`;
}

/** "20.00" from 2000 usd, for a money input. */
export function moneyInputText(amount: number, currency: string): string {
	const digits = currencyDigits(currency);
	return (amount / 10 ** digits).toFixed(digits);
}

/** The typed amount in the currency's smallest unit; null when it is not a number or has more decimals than the currency. */
export function parseMoneyInput(text: string, currency: string): number | null {
	const digits = currencyDigits(currency);
	const pattern =
		digits === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{1,${digits}})?$`);
	const typed = text.trim();
	if (!pattern.test(typed)) return null;
	return Math.round(Number(typed) * 10 ** digits);
}
