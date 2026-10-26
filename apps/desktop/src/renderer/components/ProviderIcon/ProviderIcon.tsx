import { accountColor } from "@superset/shared/account-colors";
import { getPresetIcon } from "@superset/ui/icons/preset-icons";
import { Bot } from "lucide-react";

export function ProviderIcon({
	provider,
	color,
	dark,
	className = "size-4",
}: {
	provider: string;
	color?: string | null;
	dark: boolean;
	className?: string;
}) {
	const icon = getPresetIcon(provider, dark);
	const tint = accountColor(color, dark);
	if (!icon)
		return (
			<Bot
				aria-hidden="true"
				className={`shrink-0 ${className}`}
				style={{ color: tint }}
			/>
		);
	return tint ? (
		<span
			aria-hidden="true"
			className={`inline-block shrink-0 ${className}`}
			style={{
				backgroundColor: tint,
				maskImage: `url("${icon}")`,
				maskSize: "contain",
				maskRepeat: "no-repeat",
				maskPosition: "center",
			}}
		/>
	) : (
		<img src={icon} alt="" className={`shrink-0 object-contain ${className}`} />
	);
}
