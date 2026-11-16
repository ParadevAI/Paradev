import { formatHex, interpolate, parse } from "culori";

const FOREGROUND_SHARE = 0.15;

/** The hex value of `--shell-frame` in globals.css, for surfaces CSS cannot paint. A theme colour that does not parse returns `background` as given. */
export function shellFrameColor(
	background: string,
	foreground: string,
): string {
	const from = parse(background);
	const to = parse(foreground);
	if (!from || !to) return background;
	return formatHex(interpolate([from, to], "oklab")(FOREGROUND_SHARE));
}
