import { expect, test } from "bun:test";
import { formatImageReport } from "./image";

const HISTORY = [
	{ CreatedBy: "USER ubuntu", Size: "0" },
	{
		CreatedBy: `RUN /bin/sh -c apt-get update && apt-get install -y --no-install-recommends ${"pkg ".repeat(40)}`,
		Size: "1234567890",
	},
	{ CreatedBy: "COPY bundle/ /opt/superset/bundle/abc/", Size: "45.6MB" },
	{ CreatedBy: "ADD file:a in /", Size: "512B" },
]
	.map((layer) => JSON.stringify(layer))
	.join("\n");

test("formatImageReport sums the layers and truncates long commands", () => {
	const lines = formatImageReport(`${HISTORY}\n`).split("\n");
	expect(lines[0]).toBe("image size: 1.28 GB");
	expect(lines[1]).toBe("       0 B  USER ubuntu");
	expect(
		lines[2]?.startsWith("   1.23 GB  RUN /bin/sh -c apt-get update"),
	).toBe(true);
	expect(lines[2]?.length).toBe(12 + 90);
	expect(lines[2]?.endsWith("…")).toBe(true);
	expect(lines[3]).toBe("   45.6 MB  COPY bundle/ /opt/superset/bundle/abc/");
	expect(lines[4]).toBe("     512 B  ADD file:a in /");
});
