import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();

const { afterAll, afterEach, describe, expect, mock, test } = await import(
	"bun:test"
);
const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { LinkedText } = await import("./LinkedText");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

describe("LinkedText", () => {
	test("web addresses become links and the text around them stays", () => {
		const view = render(
			<p>
				<LinkedText text="Doc: https://docs.example.com/offsite. Read it." />
			</p>,
		);
		const link = view.getByRole("link");
		expect(link.getAttribute("href")).toBe("https://docs.example.com/offsite");
		expect(view.container.textContent).toBe(
			"Doc: https://docs.example.com/offsite. Read it.",
		);
	});

	test("text with no address has no link", () => {
		const view = render(
			<p>
				<LinkedText text="Walk through the rollout numbers." />
			</p>,
		);
		expect(view.queryByRole("link")).toBeNull();
	});

	test("a mailto link goes to the handler when one is given", () => {
		const onMailto = mock();
		const view = render(
			<p>
				<LinkedText text="mailto:avery@example.com" onMailto={onMailto} />
			</p>,
		);
		fireEvent.click(view.getByRole("link"));
		expect(onMailto).toHaveBeenCalledWith("mailto:avery@example.com");
	});
});
