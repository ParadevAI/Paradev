import { useLingui } from "@lingui/react/macro";
import { useStripeLabels } from "../../../../hooks/useStripeLabels";
import type { StripeCouponView } from "../../../../types";
import { StripeRadio } from "../../../StripeRadio";

interface CouponListProps {
	coupons: StripeCouponView[];
	value: string;
	onChange: (id: string) => void;
	disabled: boolean;
}

/** The account's coupons to pick one from, each with its terms. */
export function CouponList({
	coupons,
	value,
	onChange,
	disabled,
}: CouponListProps) {
	const { t } = useLingui();
	const { couponLabel } = useStripeLabels();
	return (
		<StripeRadio
			label={t({ message: "Coupon" })}
			value={value}
			onChange={onChange}
			disabled={disabled}
			options={coupons.map((coupon) => ({
				value: coupon.id,
				label: couponLabel(coupon),
			}))}
		/>
	);
}
