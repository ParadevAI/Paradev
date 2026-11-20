import { expect, spyOn, test } from "bun:test";
import { AutumnError } from "autumn-js";
import { autumnClient } from "../../../autumn";
import { setAutumnSeats } from "./seats";

test("a missing Autumn customer allows legacy seat handling without retries or alerts", async () => {
	const body = JSON.stringify({ code: "customer_not_found" });
	const getCustomer = spyOn(autumnClient.customers, "get").mockRejectedValue(
		new AutumnError("Customer does not exist in this org and env", {
			body,
			response: new Response(body, { status: 404 }),
		}),
	);
	const fetch = spyOn(globalThis, "fetch").mockRejectedValue(
		new Error("Unexpected external request"),
	);
	try {
		expect(await setAutumnSeats("missing-org", 1)).toBe(false);
		expect(getCustomer).toHaveBeenCalledTimes(1);
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		getCustomer.mockRestore();
		fetch.mockRestore();
	}
});
