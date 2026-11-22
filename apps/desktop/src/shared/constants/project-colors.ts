import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import {
	PROJECT_COLOR_SWATCHES,
	type ProjectColorId,
} from "@superset/shared/project-colors";

/** Special value representing "no custom color" - uses default gray border */
export const PROJECT_COLOR_DEFAULT = "default";

const COLOR_NAMES: Record<ProjectColorId, () => string> = {
	red: () => i18n._(msg({ message: "Red" })),
	orange: () => i18n._(msg({ message: "Orange" })),
	yellow: () => i18n._(msg({ message: "Yellow" })),
	lime: () => i18n._(msg({ message: "Lime" })),
	green: () => i18n._(msg({ message: "Green" })),
	teal: () => i18n._(msg({ message: "Teal" })),
	cyan: () => i18n._(msg({ message: "Cyan" })),
	blue: () => i18n._(msg({ message: "Blue" })),
	indigo: () => i18n._(msg({ message: "Indigo" })),
	purple: () => i18n._(msg({ message: "Purple" })),
	pink: () => i18n._(msg({ message: "Pink" })),
	slate: () => i18n._(msg({ message: "Slate" })),
};

/**
 * `name()` is the swatch label in the active locale. It stays a function
 * rather than a `msg()` descriptor because this module is also imported by
 * the Electron main process, whose build does not run the Lingui macro
 * transform.
 */
export const PROJECT_COLORS = PROJECT_COLOR_SWATCHES.map((swatch) => ({
	...swatch,
	name: COLOR_NAMES[swatch.id],
}));

export const PROJECT_CUSTOM_COLORS = PROJECT_COLORS;
