import { join } from "node:path";
import { accountColor } from "@superset/shared/account-colors";
import { app, type NativeImage, nativeImage } from "electron";

const images = new Map<string, NativeImage>();
const MAX_CACHED_ICONS = 128;
export function providerTrayIcon(
	provider: string,
	color?: string | null,
	dark = false,
) {
	const tint = accountColor(color, dark);
	const key = `${provider}:${tint ?? "template"}`;
	const cached = images.get(key);
	if (cached) {
		images.delete(key);
		images.set(key, cached);
		return cached;
	}
	const base = app.isPackaged
		? join(process.resourcesPath, "app.asar.unpacked/resources/tray")
		: join(app.getAppPath(), "src/resources/tray");
	const name = provider === "agy" ? "antigravity" : provider;
	let icon = nativeImage.createFromPath(join(base, `${name}Template.png`));
	if (icon.isEmpty()) return icon;
	if (tint) {
		const size = 36;
		const bitmap = icon
			.resize({ width: size, height: size })
			.toBitmap({ scaleFactor: 1 });
		const rgb = [1, 3, 5].map((offset) =>
			Number.parseInt(tint.slice(offset, offset + 2), 16),
		);
		for (let i = 0; i < bitmap.length; i += 4) {
			const alpha = (bitmap[i + 3] ?? 0) / 255;
			bitmap[i] = Math.round((rgb[2] ?? 0) * alpha);
			bitmap[i + 1] = Math.round((rgb[1] ?? 0) * alpha);
			bitmap[i + 2] = Math.round((rgb[0] ?? 0) * alpha);
		}
		icon = nativeImage.createFromBitmap(bitmap, {
			width: size,
			height: size,
			scaleFactor: 2,
		});
	}
	icon.setTemplateImage(!tint);
	images.set(key, icon);
	if (images.size > MAX_CACHED_ICONS) {
		const oldest = images.keys().next().value;
		if (oldest !== undefined) images.delete(oldest);
	}
	return icon;
}
