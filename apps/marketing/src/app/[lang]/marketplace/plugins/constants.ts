import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { PluginCategory } from "@superset/shared/plugins";

export const CATEGORY_LABELS: Record<PluginCategory, MessageDescriptor> = {
	Productivity: msg({ message: "Productivity" }),
	Communication: msg({ message: "Communication" }),
	"Developer tools": msg({ message: "Developer tools" }),
	Design: msg({ message: "Design" }),
	"Data & APIs": msg({ message: "Data & APIs" }),
};
