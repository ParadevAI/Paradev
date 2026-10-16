import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { LuStar } from "react-icons/lu";
import { IconAction } from "../IconAction";

interface StarButtonProps {
	starred: boolean;
	/** Absent when the card may not change the message: the star only shows when set. */
	onStar?: (starred: boolean) => void;
}

/** Gmail's star after a message's time. */
export function StarButton({ starred, onStar }: StarButtonProps) {
	const { t } = useLingui();
	const icon = (
		<LuStar
			className={cn("size-5", starred && "fill-[#f4b400] text-[#f4b400]")}
		/>
	);
	if (!onStar) {
		if (!starred) return null;
		return (
			<span
				role="img"
				aria-label={t({ message: "Starred" })}
				className="flex size-10 items-center justify-center"
			>
				{icon}
			</span>
		);
	}
	return (
		<IconAction
			label={
				starred ? t({ message: "Starred" }) : t({ message: "Not starred" })
			}
			onClick={() => onStar(!starred)}
		>
			{icon}
		</IconAction>
	);
}
