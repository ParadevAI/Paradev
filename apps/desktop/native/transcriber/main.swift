// On-device speech-to-text for composer dictation. Reads one audio file and
// prints one JSON line: {"text": ...} or {"error": code, "message": ...}.
// Usage: superset-transcriber <audio-file> [locale]

import AVFoundation
import Foundation
import Speech

struct Output: Encodable {
	var text: String?
	var error: String?
	var message: String?
}

func emit(_ output: Output, code: Int32) -> Never {
	let data = (try? JSONEncoder().encode(output)) ?? Data("{}".utf8)
	FileHandle.standardOutput.write(data)
	FileHandle.standardOutput.write(Data("\n".utf8))
	exit(code)
}

func fail(_ error: String, _ message: String) -> Never {
	emit(Output(error: error, message: message), code: 1)
}

// SpeechAnalyzer is in the macOS 26 SDK, which ships with Swift 6.2. An older
// toolchain builds the SFSpeechRecognizer path only.
#if compiler(>=6.2)
/// Nil when SpeechTranscriber has no model for the locale.
@available(macOS 26.0, *)
func transcribeWithAnalyzer(file: AVAudioFile, locale requested: Locale) async throws -> String? {
	guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: requested) else {
		return nil
	}
	let transcriber = SpeechTranscriber(locale: locale, preset: .transcription)
	if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
		try await request.downloadAndInstall()
	}
	let collector = Task {
		var text = ""
		for try await result in transcriber.results {
			text += String(result.text.characters)
		}
		return text
	}
	let analyzer = SpeechAnalyzer(modules: [transcriber])
	if let end = try await analyzer.analyzeSequence(from: file) {
		try await analyzer.finalizeAndFinish(through: end)
	} else {
		await analyzer.cancelAndFinishNow()
	}
	return try await collector.value
}
#endif

func transcribeWithRecognizer(url: URL, locale: Locale) async throws -> String {
	let status = await withCheckedContinuation { continuation in
		SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) }
	}
	guard status == .authorized else {
		fail("not-authorized", "Speech recognition is not allowed")
	}
	guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.supportsOnDeviceRecognition else {
		fail("unsupported-locale", "On-device dictation does not support \(locale.identifier)")
	}
	let request = SFSpeechURLRecognitionRequest(url: url)
	request.requiresOnDeviceRecognition = true
	request.shouldReportPartialResults = false
	if #available(macOS 13.0, *) {
		request.addsPunctuation = true
	}
	return try await withCheckedThrowingContinuation { continuation in
		var resumed = false
		recognizer.recognitionTask(with: request) { result, error in
			if resumed { return }
			if let error {
				resumed = true
				continuation.resume(throwing: error)
			} else if let result, result.isFinal {
				resumed = true
				continuation.resume(returning: result.bestTranscription.formattedString)
			}
		}
	}
}

let arguments = CommandLine.arguments
guard arguments.count >= 2 else {
	fail("usage", "superset-transcriber <audio-file> [locale]")
}
let url = URL(fileURLWithPath: arguments[1])
let locale = arguments.count >= 3 ? Locale(identifier: arguments[2]) : Locale.current

let file: AVAudioFile
do {
	file = try AVAudioFile(forReading: url)
} catch {
	fail("unreadable-audio", error.localizedDescription)
}

do {
	var text: String?
	#if compiler(>=6.2)
	if #available(macOS 26.0, *) {
		// Any failure here (no model, offline on first use) leaves the older
		// recognizer to try.
		text = try? await transcribeWithAnalyzer(file: file, locale: locale)
	}
	#endif
	if text == nil {
		text = try await transcribeWithRecognizer(url: url, locale: locale)
	}
	emit(Output(text: (text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)), code: 0)
} catch {
	fail("failed", error.localizedDescription)
}
