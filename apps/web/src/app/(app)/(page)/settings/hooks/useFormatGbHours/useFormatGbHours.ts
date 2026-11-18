import { useFormat } from "@superset/i18n/react";

export function useFormatGbHours() {
	const { formatNumber } = useFormat();
	return (gbHours: number) =>
		gbHours > 0 && gbHours < 0.1
			? `<${formatNumber(0.1)}`
			: formatNumber(gbHours, { maximumFractionDigits: 1 });
}
