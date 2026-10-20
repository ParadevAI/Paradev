import AVFoundation
import Speech

/// Dictation on `SpeechAnalyzer`: on device, for long-form audio, with no
/// per-request time cap. `SFSpeechRecognizer` on the server stops after about
/// one minute, which is how a 15-minute recording used to vanish.
///
/// `SpeechTranscriber` first. `DictationTranscriber` covers the devices it does
/// not run on (iPhone 11, SE 2) and every language `SFSpeechRecognizer` has an
/// on-device model for.
final class ComposerAnalyzerTranscriber {
  /// A model still downloading after this is left to finish in the background
  /// for next time, and this attempt fails.
  private static let installTimeout = Duration.seconds(10)

  private typealias ResultStream = (ComposerTranscriptHandler) async throws -> Void

  private let analyzer: SpeechAnalyzer
  private let format: AVAudioFormat
  private let input: AsyncStream<AnalyzerInput>.Continuation
  private var results: Task<Void, Never>?
  /// Touched only from the audio tap thread.
  private var converter: AVAudioConverter?

  /// Nil when neither module can run here.
  static func make(
    locale: Locale,
    onEvent: @escaping ComposerTranscriptHandler
  ) async -> ComposerAnalyzerTranscriber? {
    if SpeechTranscriber.isAvailable,
      let supported = await SpeechTranscriber.supportedLocale(equivalentTo: locale)
    {
      let module = SpeechTranscriber(locale: supported, preset: .progressiveTranscription)
      if let transcriber = try? await start(
        module: module,
        locale: supported,
        results: { onEvent in
          for try await result in module.results {
            await onEvent(Self.event(text: result.text, isFinal: result.isFinal))
          }
        },
        onEvent: onEvent
      ) {
        return transcriber
      }
    }

    if let supported = await DictationTranscriber.supportedLocale(equivalentTo: locale) {
      let module = DictationTranscriber(locale: supported, preset: .progressiveLongDictation)
      return try? await start(
        module: module,
        locale: supported,
        results: { onEvent in
          for try await result in module.results {
            await onEvent(Self.event(text: result.text, isFinal: result.isFinal))
          }
        },
        onEvent: onEvent
      )
    }
    return nil
  }

  private static func event(text: AttributedString, isFinal: Bool) -> ComposerTranscriptEvent {
    let plain = String(text.characters)
    return isFinal ? .finalized(plain) : .volatile(plain)
  }

  private static func start(
    module: any SpeechModule,
    locale: Locale,
    results: @escaping ResultStream,
    onEvent: @escaping ComposerTranscriptHandler
  ) async throws -> ComposerAnalyzerTranscriber? {
    try await reserve(locale)
    try await install(module)
    guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [module])
    else { return nil }

    let analyzer = SpeechAnalyzer(modules: [module])
    try await analyzer.prepareToAnalyze(in: format)
    let (stream, input) = AsyncStream.makeStream(of: AnalyzerInput.self)
    // Results are read only once the analyzer has started, so a failed start
    // falls through to the next engine rather than reporting a failure.
    do {
      try await analyzer.start(inputSequence: stream)
    } catch {
      input.finish()
      throw error
    }

    let transcriber = ComposerAnalyzerTranscriber(analyzer: analyzer, format: format, input: input)
    transcriber.results = Task {
      do {
        try await results(onEvent)
        guard !Task.isCancelled else { return }
        await onEvent(.ended)
      } catch {
        guard !Task.isCancelled else { return }
        await onEvent(.failed(error))
      }
    }
    return transcriber
  }

  /// Installing reserves a locale only when it downloads something, and Apple
  /// warns that using an unreserved one will become an error. The cap can be
  /// as low as one, and these are this app's reservations alone.
  private static func reserve(_ locale: Locale) async throws {
    let reserved = await AssetInventory.reservedLocales
    let wanted = locale.identifier(.bcp47)
    guard !reserved.contains(where: { $0.identifier(.bcp47) == wanted }) else { return }
    if reserved.count >= AssetInventory.maximumReservedLocales {
      for stale in reserved { await AssetInventory.release(reservedLocale: stale) }
    }
    try await AssetInventory.reserve(locale: locale)
  }

  private static func install(_ module: any SpeechModule) async throws {
    // Asking for a request costs about two seconds even when nothing is missing.
    guard await AssetInventory.status(forModules: [module]) != .installed,
      let request = try await AssetInventory.assetInstallationRequest(supporting: [module])
    else { return }
    Task { try await request.downloadAndInstall() }
    // Polled: awaiting the download ignores cancellation, so a race against a
    // sleep would still wait for the whole download.
    let deadline = ContinuousClock.now + installTimeout
    while ContinuousClock.now < deadline {
      try await Task.sleep(for: .milliseconds(250))
      if await AssetInventory.status(forModules: [module]) == .installed { return }
    }
    throw CancellationError()
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

  /// Called on the audio tap thread for every buffer.
  func append(_ buffer: AVAudioPCMBuffer) {
    guard let converted = convert(buffer) else { return }
    input.yield(AnalyzerInput(buffer: converted))
  }

  /// No more audio. Events continue until `.ended` or `.failed`.
  @MainActor
  func finish() {
    input.finish()
    let analyzer = analyzer
    Task { try? await analyzer.finalizeAndFinishThroughEndOfInput() }
  }

  /// Stop now. No further events are delivered.
  @MainActor
  func cancel() {
    results?.cancel()
    input.finish()
    let analyzer = analyzer
    Task { await analyzer.cancelAndFinishNow() }
  }

  /// Always into a fresh buffer: the tap's own is only valid during its
  /// callback, and the analyzer reads it later. The microphone's format is
  /// whatever the route gives (48 kHz on most phones, other rates on
  /// Bluetooth); the analyzer wants its own.
  private func convert(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
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
