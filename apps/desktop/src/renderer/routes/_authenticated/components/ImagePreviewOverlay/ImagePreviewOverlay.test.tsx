import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";

const reactActGlobal = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;
const { cleanup, fireEvent, render, waitFor } = await import(
	"@testing-library/react"
);
const { toast } = await import("@superset/ui/sonner");
const { ImagePreviewOverlay } = await import("./ImagePreviewOverlay");

let toastError: ReturnType<typeof spyOn<typeof toast, "error">>;
let toastSuccess: ReturnType<typeof spyOn<typeof toast, "success">>;
beforeEach(() => {
	toastError = spyOn(toast, "error").mockImplementation(() => "");
	toastSuccess = spyOn(toast, "success").mockImplementation(() => "");
});
afterEach(() => {
	cleanup();
	toastError.mockRestore();
	toastSuccess.mockRestore();
});

function pressCopy() {
	const event = new Event("copy", { bubbles: true, cancelable: true });
	document.dispatchEvent(event);
	return event;
}

function select(node: Node) {
	const range = document.createRange();
	range.selectNodeContents(node);
	const selection = window.getSelection();
	selection?.removeAllRanges();
	selection?.addRange(range);
}
afterAll(() => {
	reactActGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

const SRC = "data:image/png;base64,iVBORw0KGgo=";

function renderOverlay(
	props: Partial<Parameters<typeof ImagePreviewOverlay>[0]> = {},
) {
	return render(
		<ImagePreviewOverlay
			filename="shot.png"
			onClose={mock(() => {})}
			onDownload={mock(async () => {})}
			open
			src={SRC}
			{...props}
		/>,
	);
}

const previous = { name: "Previous image" };
const next = { name: "Next image" };

describe("ImagePreviewOverlay", () => {
	test("steps with the edge buttons, which stay enabled at the ends", () => {
		const onPrevious = mock(() => {});
		const onNext = mock(() => {});
		const view = renderOverlay({
			onNext,
			onPrevious,
			position: { index: 0, total: 3 },
		});
		expect(view.getByText("1 of 3")).toBeTruthy();
		fireEvent.click(view.getByRole("button", previous));
		expect(onPrevious).toHaveBeenCalledTimes(1);
		fireEvent.click(view.getByRole("button", next));
		expect(onNext).toHaveBeenCalledTimes(1);

		view.rerender(
			<ImagePreviewOverlay
				filename="shot.png"
				onClose={mock(() => {})}
				onDownload={mock(async () => {})}
				onNext={onNext}
				onPrevious={onPrevious}
				open
				position={{ index: 2, total: 3 }}
				src={SRC}
			/>,
		);
		expect(view.getByText("3 of 3")).toBeTruthy();
		fireEvent.click(view.getByRole("button", next));
		expect(onNext).toHaveBeenCalledTimes(2);
	});

	test("hides the step buttons and the count for a single image", () => {
		const view = renderOverlay({
			onNext: mock(() => {}),
			onPrevious: mock(() => {}),
			position: { index: 0, total: 1 },
		});
		expect(view.queryByRole("button", previous)).toBeNull();
		expect(view.queryByRole("button", next)).toBeNull();
		expect(view.queryByText("1 of 1")).toBeNull();
	});

	test("arrow keys step from either end", () => {
		const onPrevious = mock(() => {});
		const onNext = mock(() => {});
		renderOverlay({ onNext, onPrevious, position: { index: 1, total: 2 } });
		fireEvent.keyDown(window, { key: "ArrowRight" });
		expect(onNext).toHaveBeenCalledTimes(1);
		fireEvent.keyDown(window, { key: "ArrowLeft" });
		expect(onPrevious).toHaveBeenCalledTimes(1);
	});

	test("arrow keys do nothing for a single image", () => {
		const onPrevious = mock(() => {});
		const onNext = mock(() => {});
		renderOverlay({ onNext, onPrevious, position: { index: 0, total: 1 } });
		fireEvent.keyDown(window, { key: "ArrowRight" });
		fireEvent.keyDown(window, { key: "ArrowLeft" });
		expect(onNext).not.toHaveBeenCalled();
		expect(onPrevious).not.toHaveBeenCalled();
	});

	test("arrow keys do not reach listeners under the overlay", () => {
		const underneath = mock(() => {});
		document.body.addEventListener("keydown", underneath);
		try {
			renderOverlay({
				onNext: mock(() => {}),
				onPrevious: mock(() => {}),
				position: { index: 0, total: 2 },
			});
			fireEvent.keyDown(document.body, { key: "ArrowRight" });
			expect(underneath).not.toHaveBeenCalled();
		} finally {
			document.body.removeEventListener("keydown", underneath);
		}
	});

	test("a successful copy shows a check, flashes the image and confirms in a toast", async () => {
		const onCopy = mock(async () => {});
		const view = renderOverlay({ onCopy });
		expect(view.baseElement.querySelector("[data-copy-flash]")).toBeNull();
		fireEvent.click(view.getByRole("button", { name: "Copy image" }));
		await waitFor(() => view.getByRole("button", { name: "Copied" }));
		expect(onCopy).toHaveBeenCalledTimes(1);
		expect(toastSuccess).toHaveBeenCalledTimes(1);
		expect(toastSuccess.mock.calls[0]?.[0]).toBe("Image copied");
		expect(view.baseElement.querySelector("[data-copy-flash]")).toBeTruthy();
		expect(toastError).not.toHaveBeenCalled();
	});

	test("a failed copy keeps the copy button and shows a toast", async () => {
		const view = renderOverlay({
			onCopy: mock(async () => {
				throw new Error("clipboard busy");
			}),
		});
		fireEvent.click(view.getByRole("button", { name: "Copy image" }));
		await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
		expect(view.getByRole("button", { name: "Copy image" })).toBeTruthy();
		expect(view.queryByRole("button", { name: "Copied" })).toBeNull();
		expect(toastSuccess).not.toHaveBeenCalled();
	});

	test("the menu's Copy (⌘C) copies the image, even with text selected behind the overlay", async () => {
		const behind = document.createElement("p");
		behind.textContent = "transcript words";
		document.body.appendChild(behind);
		try {
			const onCopy = mock(async () => {});
			renderOverlay({ onCopy });
			expect(pressCopy().defaultPrevented).toBe(true);
			await waitFor(() => expect(onCopy).toHaveBeenCalledTimes(1));

			select(behind);
			expect(pressCopy().defaultPrevented).toBe(true);
			await waitFor(() => expect(onCopy).toHaveBeenCalledTimes(2));
		} finally {
			window.getSelection()?.removeAllRanges();
			behind.remove();
		}
	});

	test("text selected inside the overlay copies as text", async () => {
		const onCopy = mock(async () => {});
		const view = renderOverlay({ onCopy, position: { index: 0, total: 2 } });
		try {
			select(view.getByText("1 of 2"));
			expect(pressCopy().defaultPrevented).toBe(false);
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(onCopy).not.toHaveBeenCalled();
		} finally {
			window.getSelection()?.removeAllRanges();
		}
	});

	test("the copy event does nothing once the overlay is closed", () => {
		const onCopy = mock(async () => {});
		renderOverlay({ onCopy, open: false });
		expect(pressCopy().defaultPrevented).toBe(false);
		expect(onCopy).not.toHaveBeenCalled();
	});

	test("without a source it shows the fallback and disables copy", () => {
		const view = renderOverlay({
			fallback: "Couldn't load shot.png",
			onCopy: mock(async () => {}),
			src: null,
		});
		expect(view.getByText("Couldn't load shot.png")).toBeTruthy();
		expect(view.queryByRole("img")).toBeNull();
		const copy = view.getByRole("button", {
			name: "Copy image",
		}) as HTMLButtonElement;
		expect(copy.disabled).toBe(true);
	});

	test("an image that cannot be decoded says so and disables copy", () => {
		const view = renderOverlay({ onCopy: mock(async () => {}) });
		fireEvent.error(view.getByRole("img"));
		expect(view.queryByRole("img")).toBeNull();
		expect(view.getByText("Couldn't load shot.png")).toBeTruthy();
		const copy = view.getByRole("button", {
			name: "Copy image",
		}) as HTMLButtonElement;
		expect(copy.disabled).toBe(true);

		view.rerender(
			<ImagePreviewOverlay
				filename="next.png"
				onClose={mock(() => {})}
				onDownload={mock(async () => {})}
				open
				src="data:image/png;base64,AAAA"
			/>,
		);
		expect(view.getByRole("img").getAttribute("alt")).toBe("next.png");
	});

	test("marks itself as an open dialog, so the window's drag strips let clicks through", () => {
		renderOverlay({ onCopy: mock(async () => {}) });
		expect(
			document.querySelector('[role="dialog"][data-state="open"]'),
		).toBeTruthy();
	});

	test("focus moves into the dialog and back out on close", () => {
		const opener = document.createElement("button");
		document.body.appendChild(opener);
		opener.focus();
		const onClose = mock(() => {});
		const view = renderOverlay({ onClose });
		expect(document.activeElement).toBe(view.getByRole("dialog"));
		fireEvent.keyDown(window, { key: "Escape" });
		expect(onClose).toHaveBeenCalledTimes(1);

		view.rerender(
			<ImagePreviewOverlay
				filename="shot.png"
				onClose={onClose}
				onDownload={mock(async () => {})}
				open={false}
				src={SRC}
			/>,
		);
		expect(document.activeElement).toBe(opener);
		opener.remove();
	});
});
