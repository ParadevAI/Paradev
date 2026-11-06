export type SeatAction =
	| { kind: "none" }
	| { kind: "update"; quantity: number }
	| { kind: "schedule"; now: number; atRenewal: number | null };

/**
 * Added seats are billed now. Removed seats stay paid, with their cloud hours,
 * until renewal, when the count drops without a credit.
 */
export function licenseSeatAction({
	paid,
	members,
	decreasePending,
	periodEnd,
}: {
	paid: number;
	members: number;
	decreasePending: boolean;
	periodEnd: number | null;
}): SeatAction {
	if (members < paid) {
		return periodEnd
			? { kind: "schedule", now: paid, atRenewal: members }
			: { kind: "none" };
	}
	if (decreasePending) {
		return { kind: "schedule", now: members, atRenewal: null };
	}
	return members > paid
		? { kind: "update", quantity: members }
		: { kind: "none" };
}

export async function withRetry<T>(
	run: () => Promise<T>,
	{ attempts = 3, delayMs = 500 }: { attempts?: number; delayMs?: number } = {},
): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await run();
		} catch (error) {
			if (attempt >= attempts) throw error;
			await new Promise((resolve) =>
				setTimeout(resolve, delayMs * 2 ** (attempt - 1)),
			);
		}
	}
}

/**
 * When seats renew. Autumn reports the parent plan's monthly period, so a
 * yearly seat license renews on the anniversary of the subscription start.
 */
export function seatRenewal({
	startedAt,
	currentPeriodEnd,
	seatInterval,
	now,
}: {
	startedAt: number | null | undefined;
	currentPeriodEnd: number | null | undefined;
	seatInterval: string | null | undefined;
	now: number;
}): number | null {
	if (seatInterval !== "year" || !startedAt) return currentPeriodEnd ?? null;
	const start = new Date(startedAt);
	for (let year = new Date(now).getUTCFullYear(); ; year++) {
		const renewal = Date.UTC(
			year,
			start.getUTCMonth(),
			start.getUTCDate(),
			start.getUTCHours(),
			start.getUTCMinutes(),
			start.getUTCSeconds(),
		);
		if (renewal > now) return renewal;
	}
}

/** When a scheduled plan change from a yearly plan should start: its yearly renewal, not Autumn's monthly period end. */
export function yearlyChangeStart({
	scheduledAt,
	seatInterval,
	startedAt,
	currentPeriodEnd,
	now,
}: {
	scheduledAt: number | null | undefined;
	seatInterval: string | null | undefined;
	startedAt: number | null | undefined;
	currentPeriodEnd: number | null | undefined;
	now: number;
}): number | null {
	if (seatInterval !== "year" || !scheduledAt || scheduledAt <= now) {
		return null;
	}
	return seatRenewal({ startedAt, currentPeriodEnd, seatInterval, now });
}
