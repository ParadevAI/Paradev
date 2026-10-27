import { formatCompactNumber } from "@superset/i18n/format";

export function formatTokens(tokens: number): string {
	return formatCompactNumber(tokens, { maximumFractionDigits: 1 });
}
