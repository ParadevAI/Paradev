import type { FileThumbnail } from "../../Composer.types";
import { imageThumbnail, isImageUri } from "./imageThumbnail";

export const fileThumbnail: FileThumbnail = async (uri, side) =>
	isImageUri(uri) ? imageThumbnail(uri, side) : null;
