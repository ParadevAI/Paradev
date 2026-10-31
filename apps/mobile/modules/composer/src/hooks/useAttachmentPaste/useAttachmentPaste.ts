import type { UseAttachmentPaste } from "./useAttachmentPaste.types";

export const useAttachmentPaste: UseAttachmentPaste = () => ({
	canPaste: false,
	paste: () => {},
});
