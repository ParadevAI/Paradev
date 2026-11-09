import { describe, expect, test } from "bun:test";
import { GH_DEVICE_URL, parseGhDeviceCode } from "./parse-gh-device-code";

describe("parseGhDeviceCode", () => {
	test("reads the code and URL from both gh wordings, and nothing before the code", () => {
		expect(
			parseGhDeviceCode(
				"\n\u001b[0;33m!\u001b[0m One-time code (\u001b[1m84A8-ABE4\u001b[0m) copied to clipboard\nOpen this URL to continue in your web browser: https://github.com/login/device\n",
			),
		).toEqual({ code: "84A8-ABE4", url: GH_DEVICE_URL });
		expect(
			parseGhDeviceCode("! First copy your one-time code: CB54-349E\n"),
		).toEqual({ code: "CB54-349E", url: GH_DEVICE_URL });
		expect(
			parseGhDeviceCode(
				"! Did you know that expiring tokens can be requested with --expiring?",
			),
		).toBeNull();
	});
});
