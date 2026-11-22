export function wrapText(text: string, width: number): string {
	if (width < 20) return text;
	const lines: string[] = [];
	for (const paragraph of text.split("\n")) {
		let line = "";
		for (const word of paragraph.split(" ")) {
			if (line && line.length + 1 + word.length > width) {
				lines.push(line);
				line = word;
			} else {
				line = line ? `${line} ${word}` : word;
			}
		}
		lines.push(line);
	}
	return lines.join("\n");
}
