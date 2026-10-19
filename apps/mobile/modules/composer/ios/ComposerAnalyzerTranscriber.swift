import AVFoundation
import Speech

/// Dictation on `SpeechAnalyzer`: on device, for long-form audio, with no
/// per-request time cap. `SFSpeechRecognizer` on the server stops after about
/// one minute, which is how a 15-minute recording used to vanish.
final class ComposerAnalyzerTranscriber: ComposerTranscriber {
  private let analyzer: SpeechAnalyzer
  private let format: AVAudioFormat
  private let input: AsyncStream<AnalyzerInput>.Continuation
  private var results: Task<Void, Never>?
  /// Touched only from the audio tap thread.
  private var converter: AVAudioConverter?

  /// Nil when this device or language has no `SpeechTranscriber` model; the
  /// caller then falls back to `ComposerRecognizerTranscriber`.
  static func make(
    locale: Locale,
    onEvent: @escaping ComposerTranscriptHandler
  ) async throws -> ComposerAnalyzerTranscriber? {
    guard SpeechTranscriber.isAvailable,
      let supported = await SpeechTranscriber.supportedLocale(equivalentTo: locale)
    else { return nil }

    let module = SpeechTranscriber(
      locale: supported,
      transcriptionOptions: [],
      reportingOptions: [.volatileResults],
      attributeOptions: []
    )
    // First use of a language downloads its model. Dictation stays in
    // `preparing` until it is ready.
    if let install = try await AssetInventory.assetInstallationRequest(supporting: [module]) {
      try await install.downloadAndInstall()
    }
    guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [module])
    else { return nil }

    let analyzer = SpeechAnalyzer(modules: [module])
    let (stream, input) = AsyncStream.makeStream(of: AnalyzerInput.self)
    let transcriber = ComposerAnalyzerTranscriber(analyzer: analyzer, format: format, input: input)
    transcriber.results = Task {
      do {
        for try await result in module.results {
          let text = String(result.text.characters)
          await onEvent(result.isFinal ? .finalized(text) : .volatile(text))
        }
        guard !Task.isCancelled else { return }
        await onEvent(.ended)
      } catch {
        guard !Task.isCancelled else { return }
        await onEvent(.failed(error))
      }
    }
    try await analyzer.start(inputSequence: stream)
    return transcriber
  }

  private init(
    analyzer: SpeechAnalyzer,
    format: AVAudioFormat,
    input: AsyncStream<AnalyzerInput>.Continuation
  ) {
    self.analyzer = analyzer
    self.format = format
    self.input = input
  }

  func append(_ buffer: AVAudioPCMBuffer) {
    guard let converted = convert(buffer) else { return }
    input.yield(AnalyzerInput(buffer: converted))
  }

  @MainActor
  func finish() {
    input.finish()
    let analyzer = analyzer
    Task { try? await analyzer.finalizeAndFinishThroughEndOfInput() }
  }

  @MainActor
  func cancel() {
    results?.cancel()
    input.finish()
    let analyzer = analyzer
    Task { await analyzer.cancelAndFinishNow() }
  }

  /// The microphone's format is whatever the route gives (48 kHz on most
  /// phones, other rates on Bluetooth); the analyzer wants its own.
  private func convert(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
    if buffer.format == format { return buffer }
    if converter?.inputFormat != buffer.format {
      converter = AVAudioConverter(from: buffer.format, to: format)
      converter?.primeMethod = .none
    }
    guard let converter else { return nil }

    let ratio = format.sampleRate / buffer.format.sampleRate
    let capacity = AVAudioFrameCount((Double(buffer.frameLength) * ratio).rounded(.up))
    guard let output = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else {
      return nil
    }
    var delivered = false
    var error: NSError?
    converter.convert(to: output, error: &error) { _, status in
      if delivered {
        status.pointee = .noDataNow
        return nil
      }
      delivered = true
      status.pointee = .haveData
      return buffer
    }
    return error == nil && output.frameLength > 0 ? output : nil
  }
}
