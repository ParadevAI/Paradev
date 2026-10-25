import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { getExecutablePath } = require("./index.js") as {
	getExecutablePath(pid: number): string | null;
};

test(
	"macOS returns this process's kernel executable rather than a launcher alias",
	{ skip: process.platform !== "darwin" },
	() => {
		assert.equal(
			getExecutablePath(process.pid),
			realpathSync(process.execPath),
		);
		assert.equal(getExecutablePath(2_147_483_647), null);
		for (const pid of [
			0,
			-1,
			1.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			2_147_483_648,
		]) {
			assert.throws(() => getExecutablePath(pid), TypeError);
		}
	},
);

test(
	"other platforms report unavailable executable authority",
	{ skip: process.platform === "darwin" },
	() => {
		assert.equal(getExecutablePath(process.pid), null);
	},
);
