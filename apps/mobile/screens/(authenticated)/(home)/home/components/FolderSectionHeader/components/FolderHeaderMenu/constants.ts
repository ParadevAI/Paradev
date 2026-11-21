import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import {
	PROJECT_COLOR_SWATCHES,
	type ProjectColorId,
} from "@superset/shared/project-colors";

const COLOR_NAMES: Record<ProjectColorId, MessageDescriptor> = {
	red: msg({ message: "Red" }),
	orange: msg({ message: "Orange" }),
	yellow: msg({ message: "Yellow" }),
	lime: msg({ message: "Lime" }),
	green: msg({ message: "Green" }),
	teal: msg({ message: "Teal" }),
	cyan: msg({ message: "Cyan" }),
	blue: msg({ message: "Blue" }),
	indigo: msg({ message: "Indigo" }),
	purple: msg({ message: "Purple" }),
	pink: msg({ message: "Pink" }),
	slate: msg({ message: "Slate" }),
};

export const GROUP_COLORS = PROJECT_COLOR_SWATCHES.map((swatch) => ({
	value: swatch.value,
	label: COLOR_NAMES[swatch.id],
}));
