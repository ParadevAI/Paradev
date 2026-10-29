import { autumnRest } from "@superset/auth/autumn";
import { dbWs } from "@superset/db/client";
import { sql } from "drizzle-orm";

const REWARDS_API_VERSION = "2.6.0";
const REQUEST_TIMEOUT_MS = 10_000;

export type PromoCode = {
	code: string;
	global_max_redemption?: number | null;
	first_time_transaction?: boolean | null;
};

type CouponReward = { id: string; promo_codes: PromoCode[] };

async function getCoupon(rewardId: string): Promise<CouponReward> {
	const { coupon } = await autumnRest<{ coupon?: CouponReward }>(
		"rewards.get",
		{ reward_id: rewardId },
		REQUEST_TIMEOUT_MS,
		REWARDS_API_VERSION,
	);
	if (!coupon) throw new Error(`Autumn reward ${rewardId} is not a coupon`);
	return coupon;
}

function writable({
	code,
	global_max_redemption,
	first_time_transaction,
}: PromoCode): PromoCode {
	return { code, global_max_redemption, first_time_transaction };
}

/**
 * Adds one promo code to a standing Autumn coupon reward.
 *
 * Autumn has no "add a code" call: `rewards.update` replaces the whole list,
 * so two writers that read the same list drop each other's code. Writers are
 * serialized on an advisory lock, and the list is read back to prove that no
 * code was lost.
 */
export async function addRewardPromoCode(
	rewardId: string,
	promoCode: PromoCode,
): Promise<void> {
	await dbWs.transaction(async (tx) => {
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtextextended(${`autumn-reward:${rewardId}`}, 0))`,
		);

		const before = await getCoupon(rewardId);
		const expected = before.promo_codes.some((c) => c.code === promoCode.code)
			? before.promo_codes
			: [...before.promo_codes, promoCode];
		if (expected !== before.promo_codes) {
			await autumnRest(
				"rewards.update",
				{
					reward_id: rewardId,
					coupon: { promo_codes: expected.map(writable) },
				},
				REQUEST_TIMEOUT_MS,
				REWARDS_API_VERSION,
			);
		}

		const after = await getCoupon(rewardId);
		const saved = new Set(after.promo_codes.map((c) => c.code));
		const missing = expected.filter((c) => !saved.has(c.code));
		if (missing.length > 0) {
			throw new Error(
				`Autumn reward ${rewardId} is missing promo codes after update: ${missing.map((c) => c.code).join(", ")}`,
			);
		}
	});
}
