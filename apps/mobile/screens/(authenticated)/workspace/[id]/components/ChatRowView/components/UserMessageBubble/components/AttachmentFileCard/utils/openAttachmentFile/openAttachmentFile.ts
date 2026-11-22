import { File } from "expo-file-system";
import type { OpenAttachmentFile } from "./openAttachmentFile.types";

export const openAttachmentFile: OpenAttachmentFile = ({
	uri,
	name,
	mediaType,
}) => new File(uri).preview({ title: name, mimeType: mediaType });
