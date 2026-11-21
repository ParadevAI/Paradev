import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// iPhone Duo shows an app built with an older SDK in a compatibility window,
// without the vertical bar rail. Only the iOS 27.1 SDK (Xcode 27.1) gives it the
// whole display.
const IOS_27_1_IMAGE = /xcode-27\.([1-9]|\d{2,})$/;

type Profile = { extends?: string; ios?: { image?: string } };
const profiles = (
	JSON.parse(readFileSync(join(import.meta.dir, "eas.json"), "utf8")) as {
		build: Record<string, Profile>;
	}
).build;

const imageOf = (name: string): string | undefined => {
	const profile = profiles[name];
	return profile?.ios?.image ?? (profile?.extends && imageOf(profile.extends));
};

describe("eas.json iOS image", () => {
	test("every build profile builds with Xcode 27.1 or later", () => {
		for (const name of Object.keys(profiles)) {
			expect({ name, image: imageOf(name) }).toEqual({
				name,
				image: expect.stringMatching(IOS_27_1_IMAGE),
			});
		}
	});
});
