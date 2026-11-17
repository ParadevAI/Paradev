import { describe, expect, it } from "bun:test";
import {
	refuseHostFlagsForCloud,
	splitCloudHost,
} from "./resolveCloudAutomationTarget";

describe("splitCloudHost", () => {
	it("treats --host cloud as --cloud, in any case, and keeps real host ids", () => {
		for (const host of ["cloud", "Cloud", "CLOUD"]) {
			expect(splitCloudHost(host)).toEqual({ cloud: true, host: undefined });
		}
		expect(splitCloudHost("host-1")).toEqual({ cloud: false, host: "host-1" });
		expect(() =>
			refuseHostFlagsForCloud({
				"--host": splitCloudHost("cloud").host,
				"--local": true,
			}),
		).toThrow("--local does not apply to a cloud automation");
	});
});
