import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, renderHook } = await import("@testing-library/react");
const { DictationError } = await import("../../utils/dictationError");
const { useDictation } = await import("./useDictation");

const stoppedTracks: number[] = [];

class FakeRecorder {
	static lastOptions: MediaRecorderOptions | undefined;
	mimeType = "audio/webm;codecs=opus";
	ondataavailable: ((event: { data: Blob }) => void) | null = null;
	onstop: (() => void) | null = null;
	constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
		FakeRecorder.lastOptions = options;
	}
	start() {}
	static deferStop = false;
	stop() {
		this.ondataavailable?.({ data: new Blob(["speech"]) });
		if (FakeRecorder.deferStop) setTimeout(() => this.onstop?.(), 0);
		else this.onstop?.();
	}
}

class FakeAudioContext {
	createMediaStreamSource() {
		return { connect() {} };
	}
	createAnalyser() {
		return { fftSize: 32, getFloatTimeDomainData() {} };
	}
	close() {
		return Promise.resolve();
	}
}

const saved = {
	MediaRecorder: globalThis.MediaRecorder,
	AudioContext: globalThis.AudioContext,
	mediaDevices: navigator.mediaDevices,
};

beforeEach(() => {
	stoppedTracks.length = 0;
	FakeRecorder.deferStop = false;
	Object.assign(globalThis, {
		MediaRecorder: FakeRecorder,
		AudioContext: FakeAudioContext,
	});
	Object.defineProperty(navigator, "mediaDevices", {
		configurable: true,
		value: {
			getUserMedia: async () => ({
				getTracks: () => [{ stop: () => stoppedTracks.push(1) }],
			}),
		},
	});
});

afterEach(() => {
	cleanup();
	Object.assign(globalThis, {
		MediaRecorder: saved.MediaRecorder,
		AudioContext: saved.AudioContext,
	});
	Object.defineProperty(navigator, "mediaDevices", {
		configurable: true,
		value: saved.mediaDevices,
	});
});

afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

function setup(
	transcribe: (
		audio: Blob,
		options: { signal: AbortSignal },
	) => Promise<string>,
	extra: { maxSeconds?: number } = {},
) {
	const transcripts: string[] = [];
	const errors: { message: string; canRetry: boolean }[] = [];
	const hook = renderHook(() =>
		useDictation({
			transcribe,
			onTranscript: (text) => transcripts.push(text),
			onError: (error) => errors.push(error),
			audioBitsPerSecond: 32_000,
			...extra,
		}),
	);
	return { hook, transcripts, errors };
}

describe("useDictation", () => {
	test("records, transcribes and hands back the text", async () => {
		const { hook, transcripts } = setup(async () => "ship it");
		await act(() => hook.result.current.start());
		expect(hook.result.current.status).toBe("recording");
		expect(FakeRecorder.lastOptions).toEqual({ audioBitsPerSecond: 32_000 });
		await act(() => hook.result.current.finish());
		expect(transcripts).toEqual(["ship it"]);
		expect(hook.result.current.status).toBe("idle");
		expect(stoppedTracks.length).toBe(1);
	});

	test("keeps the recording for retry after a retryable failure", async () => {
		let fail = true;
		const { hook, transcripts, errors } = setup(async () => {
			if (fail) throw new DictationError("Offline", { canRetry: true });
			return "second try";
		});
		await act(() => hook.result.current.start());
		await act(() => hook.result.current.finish());
		expect(hook.result.current.status).toBe("error");
		expect(errors[0]?.canRetry).toBe(true);
		fail = false;
		await act(() => hook.result.current.retry());
		expect(transcripts).toEqual(["second try"]);
		expect(hook.result.current.status).toBe("idle");
	});

	test("returns to idle after a failure that cannot be retried", async () => {
		const { hook, errors } = setup(async () => {
			throw new DictationError("Not available", { canRetry: false });
		});
		await act(() => hook.result.current.start());
		await act(() => hook.result.current.finish());
		expect(errors).toEqual([{ message: "Not available", canRetry: false }]);
		expect(hook.result.current.status).toBe("idle");
		expect(hook.result.current.error).toBeNull();
	});

	test("cancel aborts and drops a transcription that is still in flight", async () => {
		let resolve: (text: string) => void = () => {};
		let signal: AbortSignal | undefined;
		const { hook, transcripts } = setup((_audio, options) => {
			signal = options.signal;
			return new Promise<string>((done) => (resolve = done));
		});
		await act(() => hook.result.current.start());
		let finishing: Promise<void> = Promise.resolve();
		await act(async () => {
			finishing = hook.result.current.finish();
		});
		expect(hook.result.current.status).toBe("transcribing");
		expect(signal?.aborted).toBe(false);
		act(() => hook.result.current.cancel());
		expect(signal?.aborted).toBe(true);
		await act(async () => {
			resolve("too late");
			await finishing;
		});
		expect(transcripts).toEqual([]);
		expect(hook.result.current.status).toBe("idle");
	});

	test("cancel while the recorder is still stopping drops the clip", async () => {
		FakeRecorder.deferStop = true;
		let calls = 0;
		const { hook, transcripts } = setup(async () => {
			calls += 1;
			return "should not land";
		});
		await act(() => hook.result.current.start());
		await act(async () => {
			const finishing = hook.result.current.finish();
			hook.result.current.cancel();
			await finishing;
		});
		expect(calls).toBe(0);
		expect(transcripts).toEqual([]);
		expect(hook.result.current.status).toBe("idle");
	});

	test("stops and transcribes on its own at the length cap", async () => {
		const { hook, transcripts } = setup(async () => "capped", {
			maxSeconds: 0.01,
		});
		await act(() => hook.result.current.start());
		await act(() => new Promise((done) => setTimeout(done, 30)));
		expect(transcripts).toEqual(["capped"]);
	});
});
