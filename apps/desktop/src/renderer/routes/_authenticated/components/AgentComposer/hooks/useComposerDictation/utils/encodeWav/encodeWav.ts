const HEADER_BYTES = 44;

/** 16-bit PCM mono WAV, the format the on-device transcriber reads. */
export function encodeWav(
	samples: Float32Array,
	sampleRate: number,
): Uint8Array<ArrayBuffer> {
	const bytes = new Uint8Array(HEADER_BYTES + samples.length * 2);
	const view = new DataView(bytes.buffer);
	const writeAscii = (offset: number, text: string) => {
		for (let index = 0; index < text.length; index += 1)
			view.setUint8(offset + index, text.charCodeAt(index));
	};
	writeAscii(0, "RIFF");
	view.setUint32(4, bytes.length - 8, true);
	writeAscii(8, "WAVE");
	writeAscii(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	writeAscii(36, "data");
	view.setUint32(40, samples.length * 2, true);
	for (let index = 0; index < samples.length; index += 1) {
		const clamped = Math.max(-1, Math.min(1, samples[index] ?? 0));
		view.setInt16(
			HEADER_BYTES + index * 2,
			clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
			true,
		);
	}
	return bytes;
}
