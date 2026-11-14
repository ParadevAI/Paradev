import type { ComposerModeOption } from "../../Composer.types";

export interface ComposerModeMenuProps {
	options: ComposerModeOption[];
	selectedId?: string | null;
	onSelect?: (id: string) => void;
}
