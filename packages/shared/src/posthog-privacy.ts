export const RECORDING_UNMASK_ATTRIBUTE = "data-ph-unmask";

export const recordingUnmaskProps = {
	[RECORDING_UNMASK_ATTRIBUTE]: "",
} as const;

export function maskRecordedText(text: string, element?: HTMLElement): string {
	if (element?.closest(`[${RECORDING_UNMASK_ATTRIBUTE}]`)) return text;
	return text.replace(/\S/g, "*");
}

export const POSTHOG_PRIVACY_CONFIG = {
	mask_all_text: true,
	mask_all_element_attributes: true,
	session_recording: {
		maskAllInputs: true,
		maskTextSelector: "*",
		maskTextFn: maskRecordedText,
	},
};
