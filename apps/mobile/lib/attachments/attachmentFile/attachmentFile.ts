import { File } from "expo-file-system";
import type {
	AttachmentSize,
	OpenAttachmentFile,
} from "./attachmentFile.types";

export const attachmentSize: AttachmentSize = (uri) => new File(uri).size;

export const openAttachmentFile: OpenAttachmentFile = async (uri) => {
	const file = new File(uri);
	return {
		size: file.size,
		upload: (url, options) =>
			file.upload(url, { httpMethod: "PUT", ...options }),
	};
};
