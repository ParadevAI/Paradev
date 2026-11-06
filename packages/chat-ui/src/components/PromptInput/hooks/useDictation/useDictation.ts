"use client";

import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { type RefObject, useEffect, useRef, useState } from "react";
import type { PromptInputDictationError } from "../../types";
import { DictationError } from "../../utils/dictationError";

const BAR_SPACING = 4;
const BAR_WIDTH = 2;
const BAR_INTERVAL_MS = 60;
const AMPLITUDE_SCALE = 10;
const SILENCE_FLOOR = 0.0025;
const SILENCE_ALPHA = 0.35;

export type DictationStatus = "idle" | "recording" | "transcribing" | "error";

export type UseDictationOptions = {
	transcribe: (
		audio: Blob,
		options: { signal: AbortSignal },
	) => Promise<string> | string;
	onTranscript: (text: string) => void;
	onError?: (error: PromptInputDictationError) => void;
	maxSeconds?: number;
	audioBitsPerSecond?: number;
};

export type Dictation = {
	status: DictationStatus;
	seconds: number;
	error: PromptInputDictationError | null;
	canvasRef: RefObject<HTMLCanvasElement | null>;
	start: () => Promise<void>;
	finish: () => Promise<void>;
	retry: () => Promise<void>;
	cancel: () => void;
};

function describeStartError(error: unknown): PromptInputDictationError {
	const name = error instanceof Error ? error.name : null;
	if (name === "NotAllowedError" || name === "SecurityError")
		return {
			message: i18n._(
				msg({
					message: "Allow microphone access to use dictation",
				}),
			),
			canRetry: false,
		};
	if (
		name === "NotFoundError" ||
		name === "DevicesNotFoundError" ||
		name === "OverconstrainedError"
	)
		return {
			message: i18n._(
				msg({
					message: "Connect a microphone to use dictation",
				}),
			),
			canRetry: false,
		};
	if (name === "NotReadableError" || name === "TrackStartError")
		return {
			message: i18n._(
				msg({
					message: "Close other apps using the microphone",
				}),
			),
			canRetry: false,
		};
	if (name === "NotSupportedError" || name === "TypeError")
		return {
			message: i18n._(
				msg({
					message: "Dictation is not available on this device",
				}),
			),
			canRetry: false,
		};
	return {
		message: i18n._(
			msg({
				message: "Unable to start dictation",
			}),
		),
		canRetry: false,
	};
}

function describeTranscribeError(error: unknown): PromptInputDictationError {
	if (error instanceof DictationError)
		return { message: error.message, canRetry: error.canRetry };
	const text = error instanceof Error ? error.message.toLowerCase() : "";
	if (
		text.includes("fetch failed") ||
		text.includes("failed to fetch") ||
		text.includes("network")
	)
		return {
			message: i18n._(
				msg({
					message: "Check your connection and try again",
				}),
			),
			canRetry: true,
		};
	return {
		message: i18n._(
			msg({
				message: "Unable to transcribe audio",
			}),
		),
		canRetry: true,
	};
}

type RecordingSession = {
	stream: MediaStream;
	recorder: MediaRecorder;
	audioContext: AudioContext;
	chunks: Blob[];
	frame: number;
	// A timer, not the frame loop: frames pause while the window is hidden.
	stopTimer?: ReturnType<typeof setTimeout>;
};

function releaseSession(session: RecordingSession) {
	cancelAnimationFrame(session.frame);
	clearTimeout(session.stopTimer);
	for (const track of session.stream.getTracks()) track.stop();
	session.audioContext.close().catch(() => {});
}

export function useDictation({
	transcribe,
	onTranscript,
	onError,
	maxSeconds,
	audioBitsPerSecond,
}: UseDictationOptions): Dictation {
	const [status, setStatus] = useState<DictationStatus>("idle");
	const [seconds, setSeconds] = useState(0);
	const [error, setError] = useState<PromptInputDictationError | null>(null);
	const retryAudioRef = useRef<Blob | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const sessionRef = useRef<RecordingSession | null>(null);
	const historyRef = useRef<number[]>([]);
	const bucketPeakRef = useRef(0);
	const nextBarAtRef = useRef(0);
	const startedAtRef = useRef(0);
	const startingRef = useRef(false);
	const disposedRef = useRef(false);
	// Bumped to drop a transcription still in flight (cancel, unmount).
	const transcriptionRef = useRef(0);
	const transcriptionAbortRef = useRef<AbortController | null>(null);
	const finishRef = useRef<() => Promise<void>>(async () => {});

	useEffect(() => {
		disposedRef.current = false;
		return () => {
			disposedRef.current = true;
			transcriptionRef.current += 1;
			transcriptionAbortRef.current?.abort();
			const session = sessionRef.current;
			if (!session) return;
			sessionRef.current = null;
			releaseSession(session);
		};
	}, []);

	const draw = () => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const devicePixels = window.devicePixelRatio || 1;
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		if (canvas.width !== width * devicePixels) {
			canvas.width = width * devicePixels;
			canvas.height = height * devicePixels;
		}
		const context = canvas.getContext("2d");
		if (!context) return;
		context.setTransform(devicePixels, 0, 0, devicePixels, 0, 0);
		context.clearRect(0, 0, width, height);
		context.fillStyle = getComputedStyle(canvas).color;
		const barCount = Math.max(1, Math.floor(width / BAR_SPACING));
		const recorded = historyRef.current.slice(-barCount);
		// Left-pad with silence so the full track shows from the first frame;
		// new bars enter at the right edge and scroll left.
		const padCount = barCount - recorded.length;
		const firstVoiced = recorded.findIndex((value) => value > SILENCE_FLOOR);
		const midline = height / 2;
		for (let index = 0; index < barCount; index += 1) {
			const value =
				index < padCount ? SILENCE_FLOOR : recorded[index - padCount];
			const radius = Math.max(
				0.75,
				Math.min(
					midline - 1,
					(value ?? SILENCE_FLOOR) * AMPLITUDE_SCALE * midline,
				),
			);
			const voiced = firstVoiced !== -1 && index - padCount >= firstVoiced;
			context.globalAlpha = voiced ? 1 : SILENCE_ALPHA;
			context.fillRect(
				index * BAR_SPACING,
				midline - radius,
				BAR_WIDTH,
				radius * 2,
			);
		}
		context.globalAlpha = 1;
	};

	const start = async () => {
		if (sessionRef.current || startingRef.current) return;
		setError(null);
		retryAudioRef.current = null;
		let stream: MediaStream | undefined;
		let recorder: MediaRecorder;
		startingRef.current = true;
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			recorder = new MediaRecorder(
				stream,
				audioBitsPerSecond ? { audioBitsPerSecond } : undefined,
			);
		} catch (cause) {
			for (const track of stream?.getTracks() ?? []) track.stop();
			onError?.(describeStartError(cause));
			return;
		} finally {
			startingRef.current = false;
		}
		if (disposedRef.current) {
			for (const track of stream.getTracks()) track.stop();
			return;
		}
		const chunks: Blob[] = [];
		recorder.ondataavailable = (event) => {
			if (event.data.size > 0) chunks.push(event.data);
		};
		recorder.start();
		const audioContext = new AudioContext();
		const source = audioContext.createMediaStreamSource(stream);
		const analyser = audioContext.createAnalyser();
		analyser.fftSize = 2048;
		source.connect(analyser);
		const samples = new Float32Array(analyser.fftSize);
		historyRef.current = [];
		bucketPeakRef.current = 0;
		startedAtRef.current = performance.now();
		nextBarAtRef.current = startedAtRef.current + BAR_INTERVAL_MS;
		setSeconds(0);
		setStatus("recording");
		const tick = () => {
			analyser.getFloatTimeDomainData(samples);
			let sum = 0;
			for (const sample of samples) sum += sample * sample;
			const rms = Math.sqrt(sum / samples.length);
			bucketPeakRef.current = Math.max(bucketPeakRef.current, rms);
			const now = performance.now();
			// A stalled frame can span several bar intervals; every missed bar
			// gets the measured peak so gaps never read as sudden silence.
			const peak = Math.max(SILENCE_FLOOR, bucketPeakRef.current);
			let pushed = false;
			while (now >= nextBarAtRef.current) {
				historyRef.current.push(peak);
				if (historyRef.current.length > 4096) historyRef.current.shift();
				nextBarAtRef.current += BAR_INTERVAL_MS;
				pushed = true;
			}
			if (pushed) bucketPeakRef.current = 0;
			setSeconds(Math.floor((now - startedAtRef.current) / 1000));
			draw();
			const session = sessionRef.current;
			if (session) session.frame = requestAnimationFrame(tick);
		};
		sessionRef.current = {
			stream,
			recorder,
			audioContext,
			chunks,
			frame: requestAnimationFrame(tick),
			stopTimer: maxSeconds
				? setTimeout(() => void finishRef.current(), maxSeconds * 1000)
				: undefined,
		};
	};

	const runTranscription = async (audio: Blob) => {
		const run = ++transcriptionRef.current;
		setStatus("transcribing");
		try {
			const controller = new AbortController();
			transcriptionAbortRef.current = controller;
			const text = await Promise.resolve(
				transcribe(audio, { signal: controller.signal }),
			);
			if (run !== transcriptionRef.current) return;
			if (text) onTranscript(text);
			retryAudioRef.current = null;
			setError(null);
			setStatus("idle");
		} catch (cause) {
			if (run !== transcriptionRef.current) return;
			const described = describeTranscribeError(cause);
			onError?.(described);
			if (!described.canRetry) {
				retryAudioRef.current = null;
				setError(null);
				setStatus("idle");
				return;
			}
			// Keep the recording so a retry never loses the user's speech.
			retryAudioRef.current = audio;
			setError(described);
			setStatus("error");
		}
	};

	const finish = async () => {
		const session = sessionRef.current;
		if (!session) return;
		sessionRef.current = null;
		cancelAnimationFrame(session.frame);
		clearTimeout(session.stopTimer);
		const generation = transcriptionRef.current;
		const audio = await new Promise<Blob>((resolve) => {
			session.recorder.onstop = () =>
				resolve(new Blob(session.chunks, { type: session.recorder.mimeType }));
			session.recorder.stop();
		});
		releaseSession(session);
		if (transcriptionRef.current !== generation) return;
		if (audio.size === 0) {
			setStatus("idle");
			return;
		}
		await runTranscription(audio);
	};
	finishRef.current = finish;

	const retry = async () => {
		const audio = retryAudioRef.current;
		if (!audio) return;
		await runTranscription(audio);
	};

	// Abort without inserting anything: tears down a live recording, drops a
	// transcription in flight, or clears the error state.
	const cancel = () => {
		transcriptionRef.current += 1;
		transcriptionAbortRef.current?.abort();
		const session = sessionRef.current;
		if (session) {
			sessionRef.current = null;
			session.recorder.stop();
			releaseSession(session);
		}
		retryAudioRef.current = null;
		setError(null);
		setStatus("idle");
	};

	return { status, seconds, error, canvasRef, start, finish, retry, cancel };
}
