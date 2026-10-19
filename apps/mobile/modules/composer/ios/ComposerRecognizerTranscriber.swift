import AVFoundation
import Speech

/// Dictation on `SFSpeechRecognizer`, for languages `SpeechTranscriber` does
/// not cover.
///
/// On device where the language allows it. Server recognition stops after
/// about a minute per request, so there each request is ended before that and
/// a new one takes over. A word spoken across the hand-over can be split.
final class ComposerRecognizerTranscriber: ComposerTranscriber {
  private static let serverSegmentLength = Duration.seconds(50)

  private let recognizer: SFSpeechRecognizer
  private let onDevice: Bool
  private let onEvent: ComposerTranscriptHandler

  /// The audio thread appends to whichever request is live.
  private let lock = NSLock()
  private var request: SFSpeechAudioBufferRecognitionRequest?

  private var tasks: [Int: SFSpeechRecognitionTask] = [:]
  private var partials: [Int: String] = [:]
  private var nextSegment = 0
  private var liveSegment = -1
  private var isFinishing = false
  private var isCancelled = false
  private var rotation: Task<Void, Never>?

  @MainActor
  init?(onEvent: @escaping ComposerTranscriptHandler) {
    guard let recognizer = SFSpeechRecognizer(), recognizer.isAvailable else { return nil }
    self.recognizer = recognizer
    self.onDevice = recognizer.supportsOnDeviceRecognition
    self.onEvent = onEvent
    beginSegment()
    if !onDevice { scheduleRotation() }
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

  @MainActor
  private func beginSegment() {
    let id = nextSegment
    nextSegment += 1
    let next = SFSpeechAudioBufferRecognitionRequest()
    next.shouldReportPartialResults = true
    next.requiresOnDeviceRecognition = onDevice
    next.addsPunctuation = true
    liveSegment = id
    tasks[id] = recognizer.recognitionTask(with: next) { [weak self] result, error in
      Task { @MainActor in self?.handle(segment: id, result: result, error: error) }
    }
    swapRequest(next)?.endAudio()
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

  @MainActor
  private func scheduleRotation() {
    rotation = Task { @MainActor [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: Self.serverSegmentLength)
        guard let self, !Task.isCancelled, !self.isFinishing else { return }
        self.beginSegment()
      }
    }
  }

  @MainActor
  private func handle(segment id: Int, result: SFSpeechRecognitionResult?, error: Error?) {
    guard !isCancelled, tasks[id] != nil else { return }

    if let result {
      let text = result.bestTranscription.formattedString
      if result.isFinal {
        tasks[id] = nil
        partials[id] = nil
        onEvent(.finalized(text))
        publishVolatile()
        endIfDrained()
        return
      }
      partials[id] = text
      publishVolatile()
    }

    guard let error else { return }
    tasks[id] = nil
    if let heard = partials.removeValue(forKey: id), !heard.isEmpty {
      onEvent(.finalized(heard))
    }
    publishVolatile()

    if id == liveSegment && !isFinishing {
      // A long silence ends a request with "no speech"; that is not a failure
      // of the dictation, so listening carries on in a new one.
      guard Self.isNoSpeech(error) else {
        cancel()
        onEvent(.failed(error))
        return
      }
      beginSegment()
      return
    }
    endIfDrained()
  }

  @MainActor
  private func publishVolatile() {
    let text = partials.keys.sorted()
      .compactMap { partials[$0] }
      .filter { !$0.isEmpty }
      .joined(separator: " ")
    onEvent(.volatile(text))
  }

  @MainActor
  private func endIfDrained() {
    guard isFinishing, tasks.isEmpty else { return }
    onEvent(.ended)
  }

  private static func isNoSpeech(_ error: Error) -> Bool {
    let error = error as NSError
    return error.domain == "kAFAssistantErrorDomain" && error.code == 1110
  }
}
