import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { WrapText } from "lucide-react";
import { FENCE_BUTTON_CLASSNAME } from "../../constants";

export function WrapLinesButton({
	onChange,
	wrap,
}: {
	wrap: boolean;
	onChange: (wrap: boolean) => void;
}) {
	const { t } = useLingui();
	const label = t({ message: "Wrap lines" });
	return (
		<button
			aria-label={label}
			aria-pressed={wrap}
			className={cn(
				FENCE_BUTTON_CLASSNAME,
				wrap && "bg-foreground/10 text-foreground",
			)}
			onClick={() => onChange(!wrap)}
			title={label}
			type="button"
		>
			<WrapText className="size-3.5" />
		</button>
	);
}
