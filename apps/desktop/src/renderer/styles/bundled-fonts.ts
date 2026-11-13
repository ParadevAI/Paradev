// SF Mono is read from the macOS system path through the superset-font:// protocol.
// Registered here, not in CSS: Vite 8 resolves a hyphenated-scheme url() as a file and fails the build.
const SF_MONO_FACES = [
	{ file: "SF-Mono-Regular.otf", weight: "400", style: "normal" },
	{ file: "SF-Mono-Bold.otf", weight: "700", style: "normal" },
	{ file: "SF-Mono-RegularItalic.otf", weight: "400", style: "italic" },
	{ file: "SF-Mono-BoldItalic.otf", weight: "700", style: "italic" },
] as const;

for (const face of SF_MONO_FACES) {
	document.fonts.add(
		new FontFace(
			"SF Mono",
			`url("superset-font://fonts/${face.file}") format("opentype")`,
			{ weight: face.weight, style: face.style, display: "swap" },
		),
	);
}
