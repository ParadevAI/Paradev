import { ChevronDown } from "lucide-react";
import { HiChevronUpDown } from "react-icons/hi2";
import { useParadevShell } from "renderer/hooks/useParadevShell";
import { PILL_CHEVRON_CLASS } from "renderer/routes/_authenticated/components/AgentComposer/constants";

/** The open indicator at the end of a FormPickerTrigger. */
export function PickerChevron() {
	const isParadevShell = useParadevShell();
	return isParadevShell ? (
		<ChevronDown className={PILL_CHEVRON_CLASS} />
	) : (
		<HiChevronUpDown className="size-3 shrink-0" />
	);
}
