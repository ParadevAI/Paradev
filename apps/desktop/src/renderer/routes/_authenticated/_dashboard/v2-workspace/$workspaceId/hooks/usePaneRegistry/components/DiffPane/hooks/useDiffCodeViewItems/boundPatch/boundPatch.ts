/** Host-service bounds one getDiffPatch response at this size
 * (`MAX_PATCH_BYTES`); a split request is held to the same total. */
export const MAX_PATCH_LENGTH = 32 * 1024 * 1024;

const SECTION_START = "\ndiff --git ";

/**
 * Cuts a patch at the last file section that fits in `maxLength`. Files past
 * the cut have no section and render as placeholders, as they do when the
 * host's own bound cuts a response.
 */
export function boundPatch(
	patch: string,
	maxLength: number = MAX_PATCH_LENGTH,
): string {
	if (patch.length <= maxLength) return patch;
	const cut = patch.lastIndexOf(SECTION_START, maxLength - 1);
	return cut < 0 ? "" : patch.slice(0, cut + 1);
}
