/** A billing period when the organization has one; otherwise the router's last-30-days preset. */
export function usageRange(period: { id: string } | undefined) {
	return period ? { period: period.id } : ("30d" as const);
}
