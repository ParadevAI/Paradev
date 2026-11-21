import { useLingui } from "@lingui/react/macro";
import { WrapText } from "lucide-react";
import { FenceButton } from "../FenceButton";

export function WrapLinesButton({
	onChange,
	wrap,
}: {
	wrap: boolean;
	onChange: (wrap: boolean) => void;
}) {
	const { t } = useLingui();
	return (
		<FenceButton
			icon={WrapText}
			label={t({ message: "Wrap lines" })}
			onClick={() => onChange(!wrap)}
			pressed={wrap}
		/>
	);
}
