import AVFoundation
import Speech

/// Dictation on server `SFSpeechRecognizer`, the last resort: for languages
/// with no on-device model, or when `ComposerAnalyzerTranscriber` cannot start.
///
/// Not on device: languages that have a model go to `DictationTranscriber`,
/// and on iOS 26 on-device requests drop earlier words after a pause.
///
/// A server request stops after about a minute, and one request does not
/// reliably hold more than one utterance. So each utterance gets its own
/// request, a request is ended at 50 seconds regardless, and a request that
/// ends while the user is still talking is replaced. A word spoken across the
/// hand-over can be split.
final class ComposerRecognizerTranscriber: ComposerTranscriber {
  private static let maxSegmentLength = Duration.seconds(50)
  private static let maxFailuresInARow = 3

  private let recognizer: SFSpeechRecognizer
  private let onEvent: ComposerTranscriptHandler

  /// The audio thread appends to whichever request is live.
  private let lock = NSLock()
  private var request: SFSpeechAudioBufferRecognitionRequest?

  private var tasks: [Int: SFSpeechRecognitionTask] = [:]
  private var partials: [Int: String] = [:]
  private var nextSegment = 0
  private var liveSegment = -1
  private var failuresInARow = 0
  private var isFinishing = false
  private var isCancelled = false
  private var rotation: Task<Void, Never>?

  @MainActor
  init?(locale: Locale, onEvent: @escaping ComposerTranscriptHandler) {
    guard let recognizer = SFSpeechRecognizer(locale: locale) ?? SFSpeechRecognizer(),
      recognizer.isAvailable
    else { return nil }
    self.recognizer = recognizer
    self.onEvent = onEvent
    beginSegment()
    scheduleRotation()
  }

  func append(_ buffer: AVAudioPCMBuffer) {
    lock.lock()
    let live = request
    lock.unlock()
    live?.append(buffer)
  }

  @MainActor
  func finish() {
    isFinishing = true
    rotation?.cancel()
    swapRequest(nil)?.endAudio()
    endIfDrained()
  }

  @MainActor
  func cancel() {
    isCancelled = true
    rotation?.cancel()
    swapRequest(nil)?.endAudio()
    for task in tasks.values { task.cancel() }
    tasks = [:]
    partials = [:]
  }

  /// The previous request is ended before the next task starts: two live
  /// tasks can fail with "an earlier instance is still active" (1100).
  @MainActor
  private func beginSegment() {
    let id = nextSegment
    nextSegment += 1
    let next = SFSpeechAudioBufferRecognitionRequest()
    next.shouldReportPartialResults = true
    next.requiresOnDeviceRecognition = false
    next.addsPunctuation = true
    next.taskHint = .dictation
    swapRequest(next)?.endAudio()
    liveSegment = id
    tasks[id] = recognizer.recognitionTask(with: next) { [weak self] result, error in
      MainActor.assumeIsolated { self?.handle(segment: id, result: result, error: error) }
    }
  }

  private func swapRequest(
    _ next: SFSpeechAudioBufferRecognitionRequest?
  ) -> SFSpeechAudioBufferRecognitionRequest? {
    lock.lock()
    defer { lock.unlock() }
    let previous = request
    request = next
    return previous
  }

  /// Ends the live request at the cap. Its task still delivers the final
  /// result, which `handle` commits without starting another segment.
  @MainActor
  private func scheduleRotation() {
    rotation = Task { @MainActor [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: Self.maxSegmentLength)
        guard let self, !Task.isCancelled, !self.isFinishing else { return }
        self.beginSegment()
      }
    }
  }

  @MainActor
  private func handle(segment id: Int, result: SFSpeechRecognitionResult?, error: Error?) {
    guard !isCancelled, tasks[id] != nil else { return }

    if let result {
      let heard = result.bestTranscription.formattedString
      // Metadata marks the end of an utterance. A final result can arrive
      // empty, so the last guess is kept instead.
      if result.isFinal || result.speechRecognitionMetadata != nil {
        close(segment: id, text: heard.isEmpty ? partials[id] ?? "" : heard)
        return
      }
      partials[id] = heard
      if !heard.isEmpty { failuresInARow = 0 }
      publishVolatile()
    }

    if let error {
      close(segment: id, text: partials[id] ?? "", error: error)
    }
  }

  @MainActor
  private func close(segment id: Int, text: String, error: Error? = nil) {
    tasks.removeValue(forKey: id)?.cancel()
    partials[id] = nil
    if !text.isEmpty { onEvent(.finalized(text)) }
    publishVolatile()

    guard id == liveSegment, !isFinishing else {
      endIfDrained()
      return
    }
    if let error, !Self.isBenign(error) {
      failuresInARow += 1
      guard failuresInARow < Self.maxFailuresInARow else {
        cancel()
        onEvent(.failed(error))
        return
      }
    }
    beginSegment()
  }

  @MainActor
  private func publishVolatile() {
    let text = partials.keys.sorted()
      .compactMap { partials[$0] }
      .reduce("", ComposerDictatedText.join)
    onEvent(.volatile(text))
  }

  @MainActor
  private func endIfDrained() {
    guard isFinishing, tasks.isEmpty else { return }
    onEvent(.ended)
  }

  /// Ends of a request that are not a failure of the dictation: no speech
  /// (1110), cancellation (216, kLSR 301), and the "no match" form of 203.
  private static func isBenign(_ error: Error) -> Bool {
    let error = error as NSError
    if error.domain == "kLSRErrorDomain" { return error.code == 301 }
    guard error.domain == "kAFAssistantErrorDomain" else { return false }
    if error.code == 203,
      (error.userInfo[NSUnderlyingErrorKey] as? NSError)?.domain == "SiriSpeechErrorDomain"
    {
      return true
    }
    return [1110, 216].contains(error.code)
  }
}
