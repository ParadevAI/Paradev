import { formatHex, interpolate } from "culori";

const FOREGROUND_SHARE = 0.15;

/** The hex value of `--shell-frame` in globals.css, for surfaces CSS cannot paint. */
export function shellFrameColor(
	background: string,
	foreground: string,
): string {
	return formatHex(
		interpolate([background, foreground], "oklab")(FOREGROUND_SHARE),
	);
}
