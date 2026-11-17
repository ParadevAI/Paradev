import type { SettingItemId } from "../../../utils/settings-search";
import { ExperimentalSettingsList } from "./components/ExperimentalSettingsList";

interface ExperimentalSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function ExperimentalSettings({
	visibleItems,
}: ExperimentalSettingsProps) {
	return (
		<ExperimentalSettingsList visibleItems={visibleItems} isV2OnlyUser={false} />
	);
}
