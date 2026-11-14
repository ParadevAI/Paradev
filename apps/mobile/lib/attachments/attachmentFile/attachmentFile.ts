import { File } from "expo-file-system";
import type {
	AttachmentSize,
	OpenAttachmentFile,
	ReadAttachmentBase64,
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

export const readAttachmentBase64: ReadAttachmentBase64 = (uri) =>
	new File(uri).base64();
