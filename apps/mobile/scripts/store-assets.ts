// Builds the Google Play phone screenshots and feature graphic from raw
// emulator captures in store/captures/android.
//
//   bun apps/mobile/scripts/store-assets.ts
//
// Capture each screen at 1080x2400 with `adb exec-out screencap -p` (the
// mobile-android-verification skill has the setup), then run this script.
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";

const MOBILE_DIR = resolve(__dirname, "..");
const ROOT_DIR = resolve(MOBILE_DIR, "../..");
const CAPTURES_DIR = join(MOBILE_DIR, "store/captures/android");
const ANDROID_DIR = join(MOBILE_DIR, "store/android");
const PHONE_DIR = join(ANDROID_DIR, "phone");
const FONT_FILE = join(ROOT_DIR, "apps/marketing/public/fonts/Inter-Bold.ttf");
const MARK_FILE = join(MOBILE_DIR, "assets/splash-mark.png");

// The icon's own background, so the brand mark sits on it without a seam.
const BACKDROP = { r: 21, g: 17, b: 16 };
const BACKDROP_HEX = "#151110";
const GLOW_HEX = "#3a3330";
const FRAME_HEX = "#3d3734";

const SHOTS = [
	{ capture: "home.png", headline: "Every agent, live" },
	{ capture: "chat.png", headline: "Talk to your agent" },
	{ capture: "diff.png", headline: "Review the diff" },
	{ capture: "line-comment.png", headline: "Comment on any line" },
	{ capture: "pull-request.png", headline: "Every check, green" },
	{ capture: "terminal.png", headline: "The real terminal" },
];

const PHONE = {
	width: 1080,
	height: 1920,
	headlineSize: 84,
	headlineTop: 150,
	screenTop: 380,
	screenWidth: 900,
	radius: 56,
	border: 4,
};

const FEATURE = {
	width: 1024,
	height: 500,
	tagline: "Your coding agents, on your phone",
};

function escapeMarkup(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

async function text(
	value: string,
	size: number,
	color: string,
	width?: number,
	align: "left" | "centre" = "centre",
): Promise<{ input: Buffer; width: number; height: number }> {
	const { data, info } = await sharp({
		text: {
			text: `<span foreground="${color}">${escapeMarkup(value)}</span>`,
			font: `Inter Bold ${size}px`,
			fontfile: FONT_FILE,
			width,
			align,
			rgba: true,
		},
	})
		.png()
		.toBuffer({ resolveWithObject: true });
	return { input: data, width: info.width, height: info.height };
}

function glow(width: number, height: number, cx: number, cy: number): Buffer {
	return Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
			<defs><radialGradient id="g" cx="${cx}" cy="${cy}" r="0.75">
				<stop offset="0" stop-color="${GLOW_HEX}"/>
				<stop offset="1" stop-color="${BACKDROP_HEX}"/>
			</radialGradient></defs>
			<rect width="100%" height="100%" fill="url(#g)"/>
		</svg>`,
	);
}

/** Rounds the top corners only: the screen runs off the bottom edge. */
function topRounded(
	width: number,
	height: number,
	radius: number,
	fill: string,
): Buffer {
	return Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
			<rect width="${width}" height="${height + radius}" rx="${radius}" ry="${radius}" fill="${fill}"/>
		</svg>`,
	);
}

/** The capture scaled to `width`, cut to `height`, with rounded corners and a thin frame. */
async function framedScreen(
	capture: string,
	width: number,
	height: number,
	radius: number,
	border: number,
): Promise<Buffer> {
	const inner = width - border * 2;
	const scaled = await sharp(join(CAPTURES_DIR, capture))
		.resize({ width: inner })
		.toBuffer();
	const innerHeight = Math.min(
		height - border,
		(await sharp(scaled).metadata()).height ?? 0,
	);
	const screen = await sharp(scaled)
		.extract({ left: 0, top: 0, width: inner, height: innerHeight })
		.composite([
			{
				input: topRounded(inner, innerHeight, radius - border, "#fff"),
				blend: "dest-in",
			},
		])
		.png()
		.toBuffer();
	return sharp({
		create: {
			width,
			height: innerHeight + border,
			channels: 4,
			background: { r: 0, g: 0, b: 0, alpha: 0 },
		},
	})
		.composite([
			{
				input: topRounded(width, innerHeight + border, radius, FRAME_HEX),
				top: 0,
				left: 0,
			},
			{ input: screen, top: border, left: border },
		])
		.png()
		.toBuffer();
}

async function phoneScreenshot(
	shot: (typeof SHOTS)[number],
	file: string,
): Promise<void> {
	const headline = await text(
		shot.headline,
		PHONE.headlineSize,
		"#ffffff",
		PHONE.width - 120,
	);
	const screen = await framedScreen(
		shot.capture,
		PHONE.screenWidth,
		PHONE.height - PHONE.screenTop,
		PHONE.radius,
		PHONE.border,
	);
	await sharp(glow(PHONE.width, PHONE.height, 0.5, 0.55))
		.composite([
			{
				input: headline.input,
				top: PHONE.headlineTop,
				left: Math.round((PHONE.width - headline.width) / 2),
			},
			{
				input: screen,
				top: PHONE.screenTop,
				left: Math.round((PHONE.width - PHONE.screenWidth) / 2),
			},
		])
		.flatten({ background: BACKDROP })
		.png()
		.toFile(file);
}

async function brandMark(height: number): Promise<Buffer> {
	return sharp(MARK_FILE)
		.resize({ height })
		.modulate({ brightness: 0.82 })
		.toBuffer();
}

async function featureGraphic(file: string): Promise<void> {
	const { width, height } = FEATURE;
	const mark = await brandMark(56);
	const name = await text("Paradev", 60, "#ffffff");
	const tagline = await text(FEATURE.tagline, 24, "#bdb6b2", 420, "left");

	const phoneWidth = 300;
	const screen = await framedScreen(
		"home.png",
		phoneWidth,
		Math.round((phoneWidth * 2400) / 1080),
		26,
		3,
	);
	const tilted = await sharp(screen)
		.rotate(-10, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.toBuffer();
	const tiltedMeta = await sharp(tilted).metadata();
	const phoneLeft = 590;
	const phoneTop = 64;
	const visible = await sharp(tilted)
		.extract({
			left: 0,
			top: 0,
			width: Math.min(tiltedMeta.width ?? 0, width - phoneLeft),
			height: Math.min(tiltedMeta.height ?? 0, height - phoneTop),
		})
		.toBuffer();

	const left = 164;
	const top = 160;
	await sharp(glow(width, height, 0.72, 0.5))
		.composite([
			{ input: visible, top: phoneTop, left: phoneLeft },
			{ input: mark, top, left },
			{ input: name.input, top: top + 84, left: left - 3 },
			{
				input: tagline.input,
				top: top + 84 + name.height + 14,
				left,
			},
		])
		.flatten({ background: BACKDROP })
		.png()
		.toFile(file);
}

async function main(): Promise<void> {
	rmSync(PHONE_DIR, { recursive: true, force: true });
	mkdirSync(PHONE_DIR, { recursive: true });
	for (const [index, shot] of SHOTS.entries()) {
		const name = `${String(index + 1).padStart(2, "0")}-${shot.capture}`;
		await phoneScreenshot(shot, join(PHONE_DIR, name));
	}
	await featureGraphic(join(ANDROID_DIR, "feature-graphic.png"));
	console.log(readdirSync(PHONE_DIR).join("\n"));
}

await main();
