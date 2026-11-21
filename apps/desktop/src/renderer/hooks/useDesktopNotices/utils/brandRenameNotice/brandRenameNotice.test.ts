import { describe, expect, test } from "bun:test";
import {
	BRAND_RENAME_NOTICE_ID,
	shouldShowBrandRenameNotice,
} from "./brandRenameNotice";

const notDismissed = () => false;

describe("shouldShowBrandRenameNotice", () => {
	test("never shows while the name is unchanged", () => {
		expect(
			shouldShowBrandRenameNotice({
				name: "Superset",
				formerName: "Superset",
				previousVersion: "1.30.0",
				isDismissed: notDismissed,
			}),
		).toBe(false);
	});

	test("shows to an existing install after the rename until dismissed", () => {
		const context = {
			name: "Paradev",
			formerName: "Superset",
			previousVersion: "1.30.0",
		};
		expect(
			shouldShowBrandRenameNotice({ ...context, isDismissed: notDismissed }),
		).toBe(true);
		expect(
			shouldShowBrandRenameNotice({
				...context,
				isDismissed: (id) => id === BRAND_RENAME_NOTICE_ID,
			}),
		).toBe(false);
	});

	test("does not show on a fresh install", () => {
		expect(
			shouldShowBrandRenameNotice({
				name: "Paradev",
				formerName: "Superset",
				previousVersion: null,
				isDismissed: notDismissed,
			}),
		).toBe(false);
	});
});
