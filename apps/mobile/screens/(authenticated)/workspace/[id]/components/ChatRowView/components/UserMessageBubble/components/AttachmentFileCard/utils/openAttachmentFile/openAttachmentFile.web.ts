import type { OpenAttachmentFile } from "./openAttachmentFile.types";

const VIEWABLE = /^(text\/|image\/|audio\/|video\/|application\/pdf$)/;

export const openAttachmentFile: OpenAttachmentFile = async ({
	uri,
	name,
	mediaType,
}) => {
	const link = document.createElement("a");
	link.href = uri;
	link.rel = "noopener";
	if (VIEWABLE.test(mediaType)) link.target = "_blank";
	else link.download = name;
	link.click();
};
