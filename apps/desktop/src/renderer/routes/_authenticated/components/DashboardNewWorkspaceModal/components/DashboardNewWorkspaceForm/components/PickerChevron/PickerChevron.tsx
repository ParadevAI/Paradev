import { ChevronDown } from "lucide-react";
import { HiChevronUpDown } from "react-icons/hi2";
import { PILL_CHEVRON_CLASS } from "renderer/routes/_authenticated/components/AgentComposer/constants";
import { useNewWorkspacePageEnabled } from "renderer/stores/new-workspace-page";

/** The open indicator at the end of a FormPickerTrigger. */
export function PickerChevron() {
	const isNewPage = useNewWorkspacePageEnabled();
	return isNewPage ? (
		<ChevronDown className={PILL_CHEVRON_CLASS} />
	) : (
		<HiChevronUpDown className="size-3 shrink-0" />
	);
}
