import { expect, test } from "bun:test";

const APP_STORE_CONNECT_NOTES_LIMIT = 4000;

test("App Review notes fit App Store Connect's limit", () => {
	const { apple } = require("./store.config.js");
	expect(apple.review.notes.length).toBeLessThanOrEqual(
		APP_STORE_CONNECT_NOTES_LIMIT,
	);
});
