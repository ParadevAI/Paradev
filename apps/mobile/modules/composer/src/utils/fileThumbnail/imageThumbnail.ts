import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { PixelRatio } from "react-native";

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|heic|heif|bmp|avif)(\?|$)/i;

export function isImageUri(uri: string) {
	return IMAGE_EXTENSION.test(uri);
}

export async function imageThumbnail(uri: string, side: number) {
	try {
		const image = await ImageManipulator.manipulate(uri)
			.resize({ width: PixelRatio.getPixelSizeForLayoutSize(side) })
			.renderAsync();
		const result = await image.saveAsync({ format: SaveFormat.PNG });
		return result.uri;
	} catch {
		return null;
	}
}
