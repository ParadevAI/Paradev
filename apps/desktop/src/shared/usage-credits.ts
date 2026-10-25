export const CREDIT_FRESH_AGE_MS = 30 * 60_000;
export const CREDIT_DISPLAY_AGE_MS = 31 * 60_000;
export interface CreditBalanceInput {
	status?: string;
	identityChanged?: boolean;
	creditsBalance?: number | null;
	prepaidBalance?: {
		amount: number;
		currency: string | null;
		checkedAt: Date | string;
	};
	checkedAt?: Date | string | null;
	fetchedAt?: Date | string | null;
}
export function creditBalanceReading(
	account: CreditBalanceInput,
	offline = false,
	now = Date.now(),
) {
	if (
		account.identityChanged ||
		account.status === "signed_out" ||
		account.status === "token_expired"
	)
		return null;
	const prepaid = account.prepaidBalance;
	const amount = prepaid ? prepaid.amount : account.creditsBalance;
	const rawDate = prepaid?.checkedAt ?? account.checkedAt ?? account.fetchedAt;
	if (
		typeof amount !== "number" ||
		!Number.isFinite(amount) ||
		amount < 0 ||
		!rawDate
	)
		return null;
	const checkedAt = new Date(rawDate);
	const age = now - checkedAt.getTime();
	if (!Number.isFinite(age) || age < -60_000 || age > CREDIT_DISPLAY_AGE_MS)
		return null;
	const currency = prepaid?.currency ?? null;
	if (currency !== null && !/^[A-Z]{3}$/.test(currency)) return null;
	return {
		amount,
		currency,
		checkedAt,
		kind: prepaid ? ("prepaid" as const) : ("credits" as const),
		fresh: !offline && age <= CREDIT_FRESH_AGE_MS,
	};
}
export type CreditBalanceReading = NonNullable<
	ReturnType<typeof creditBalanceReading>
>;
export function formatCreditBalance(
	balance: CreditBalanceReading,
	locale?: string,
	compact = false,
) {
	const options: Intl.NumberFormatOptions = {
		minimumFractionDigits: compact ? 0 : 2,
		maximumFractionDigits: 2,
		...(compact ? { notation: "compact" } : {}),
		...(balance.currency
			? { style: "currency", currency: balance.currency }
			: {}),
	};
	try {
		return new Intl.NumberFormat(locale?.trim() || undefined, options).format(
			balance.amount,
		);
	} catch {
		return new Intl.NumberFormat(undefined, options).format(balance.amount);
	}
}
