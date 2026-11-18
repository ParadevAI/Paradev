import { PixelRatio } from "react-native";
import type { FileThumbnail } from "../../Composer.types";
import { ComposerAndroid } from "../../nativeComposerAndroid";
import { imageThumbnail, isImageUri } from "./imageThumbnail";

export const fileThumbnail: FileThumbnail = async (uri, side) => {
	if (isImageUri(uri)) return imageThumbnail(uri, side);
	try {
		return await ComposerAndroid.documentThumbnail(
			uri,
			PixelRatio.getPixelSizeForLayoutSize(side),
		);
	} catch {
		return null;
	}
};
