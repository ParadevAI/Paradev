import Accelerate
import AVFoundation
import SwiftUI
import Observation

/// Dictation, run entirely on this side of the bridge.
///
/// This began as a prop mirror of React Native's `useVoiceDictation`. The level
/// meter is what settled it: the recogniser's volume had to cross the bridge
/// about ten times a second, for the whole recording, purely to animate five
/// dots — precisely the chatty seam this rewrite exists to remove.
///
/// The behaviours below were each learned the hard way:
///
/// - **Settled text goes into the draft as it arrives.** Words still being
///   recognised are `volatileText`, drawn after the draft and never written
///   into it, so the draft is never rewritten mid-sentence. A failure at minute
///   fourteen loses seconds, not the recording.
/// - **No time cap.** `ComposerAnalyzerTranscriber` runs on device, with no
///   per-request limit.
/// - **A failure keeps what was heard and says so.** The volatile tail is
///   committed as the best guess, and `onError` reports why it stopped.
/// - **A finalize backstop.** Stopping asks the engine to flush; if it never
///   answers, the composer would sit in `finalizing` forever.
/// - **Append, never replace**, so dictating after typing adds to what is there.
/// - **Permission refusal settles to idle** with the prior text intact.
@Observable
final class ComposerDictation {
  enum State: Equatable {
    case idle
    /// Pressed, but the recogniser is not live yet — authorization and the
    /// audio session are both async. A state of its own rather than a gap in
    /// `idle`, because the composer has to know dictation has begun from the
    /// instant of the press: starting the audio session costs it first
    /// responder, and without this the composer reads that as the user
    /// dismissing it and closes underneath the recording.
    case preparing
    case recording(startedAt: Date)
    case finalizing
  }

  private(set) var state: State = .idle

  /// The last few loudness samples, oldest first, each 0–1.
  ///
  /// A history rather than one number, because the meter is a waveform that
  /// scrolls: each sample keeps its own bar and the row shifts left as new ones
  /// arrive. A single level would give five bars that all rise and fall
  /// together, which reads as blinking rather than as sound.
  private(set) var levels = [Double](repeating: 0, count: ComposerDictation.meterSamples)

  static let meterSamples = 5

  /// Heard but not settled yet. Replaced on every guess.
  private(set) var volatileText = ""

  /// Receives each settled stretch of speech. The composer appends it to its
  /// own draft.
  @ObservationIgnored var onTranscript: ((String) -> Void)?
  @ObservationIgnored var onError: ((String) -> Void)?

  @ObservationIgnored private let engine = AVAudioEngine()
  @ObservationIgnored private var transcriber: ComposerAnalyzerTranscriber?
  @ObservationIgnored private var backstop: Task<Void, Never>?
  /// Interruptions, route changes and media-services resets.
  @ObservationIgnored private var audioObservers: [NSObjectProtocol] = []
  /// Touched only from the audio tap thread, between publishes.
  @ObservationIgnored private var pendingFrames = 0.0
  @ObservationIgnored private var pendingPeak = 0.0

  /// Only the unsettled tail is left to flush by then, so this is generous.
  private static let finalizeTimeout = Duration.seconds(15)

  /// One bar every 100ms, so the five of them span half a second of speech.
  /// Timed off the audio clock — the number of frames actually delivered —
  /// rather than a `Timer`, so the meter cannot drift away from the sound.
  private static let meterInterval = 0.1

  var isActive: Bool { state != .idle }

  /// Every transition opens a transaction. The pill and the mic share the
  /// composer's trailing slot, so a state change relays out the control row —
  /// and the row deliberately has no animation of its own, because a second
  /// curve there sends the control along an arc. See `ComposerRootView`.
  @MainActor
  private func setState(_ next: State) {
    withAnimation(ComposerMetrics.controlSwap) { state = next }
  }

  // MARK: - Control

  @MainActor
  func start() {
    guard case .idle = state else { return }
    setState(.preparing)
    Task { @MainActor in
      guard await AVAudioApplication.requestRecordPermission() else {
        settle()
        onError?(composerLocalized("Microphone access is not allowed"))
        return
      }
      do {
        try await beginRecording()
      } catch {
        settle()
        onError?(composerLocalized("Could not start dictation"))
      }
    }
  }

  @MainActor
  func stop() {
    guard case .recording = state else { return }
    setState(.finalizing)
    // The engine flushes its tail and then reports `.ended`.
    stopEngine()
    transcriber?.finish()
    armBackstop()
  }

  // MARK: - Internals

  private enum DictationError: Error {
    case unavailable
  }

  /// The language the user speaks is closer to their first preferred language
  /// than to the app's own localization, which may be English by default.
  private static var dictationLocale: Locale {
    Locale.preferredLanguages.first.map(Locale.init(identifier:)) ?? .current
  }

  @MainActor
  private func beginRecording() async throws {
    let transcriber = try await makeTranscriber()
    guard case .preparing = state else {
      transcriber.cancel()
      return
    }
    self.transcriber = transcriber

    let session = AVAudioSession.sharedInstance()
    try session.setCategory(
      .playAndRecord,
      mode: .measurement,
      options: [.defaultToSpeaker, .allowBluetooth]
    )
    try session.setActive(true, options: .notifyOthersOnDeactivation)

    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)
    // A degenerate format is what the input node reports while something else
    // holds the microphone — a phone call, another recording app. Failing here
    // is the cheap, deterministic version of the guard below.
    guard format.sampleRate > 0, format.channelCount > 0 else {
      throw NSError(domain: "ComposerDictation", code: 2)
    }
    pendingFrames = 0
    pendingPeak = 0
    // `installTap` raises an Objective-C exception rather than throwing, and
    // an uncaught one is a crash (MOBILE-5: "Failed to create tap due to
    // format mismatch"). Two defences. No explicit format, because the node's
    // format can change between reading it and installing the tap — a
    // Bluetooth headset finishing its route switch after the session goes
    // active — so nil lets the engine take the bus's format at the moment of
    // the install, and the buffers carry the rate the meter needs. And the
    // guard, so whatever AVFoundation still objects to lands on the ordinary
    // failure path instead of taking the app down.
    try installTap(feeding: transcriber)
    engine.prepare()
    try engine.start()

    observeAudioLoss(session: session)

    setState(.recording(startedAt: Date()))
  }

  @MainActor
  private func installTap(feeding transcriber: ComposerAnalyzerTranscriber) throws {
    let input = engine.inputNode
    try ComposerExceptionGuard.run {
      input.installTap(onBus: 0, bufferSize: 1024, format: nil) { [weak self] buffer, _ in
        transcriber.append(buffer)
        self?.accumulate(buffer, sampleRate: buffer.format.sampleRate)
      }
    }
  }

  /// A route change (AirPods connecting, a headset settling after the session
  /// went active) stops the engine. Pick the new input up and carry on.
  @MainActor
  private func resumeAfterRouteChange() {
    guard case .recording = state, let transcriber else { return }
    engine.inputNode.removeTap(onBus: 0)
    do {
      try installTap(feeding: transcriber)
      engine.prepare()
      try engine.start()
    } catch {
      stop()
    }
  }

  /// A phone call or Siri taking the microphone, or a media-services reset,
  /// leaves the engine delivering no more audio. Stop and keep what was heard
  /// rather than recording silence until the user notices.
  @MainActor
  private func observeAudioLoss(session: AVAudioSession) {
    let center = NotificationCenter.default
    audioObservers = [
      center.addObserver(
        forName: AVAudioSession.interruptionNotification,
        object: session,
        queue: .main
      ) { [weak self] note in
        let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
        guard raw == AVAudioSession.InterruptionType.began.rawValue else { return }
        MainActor.assumeIsolated { self?.stop() }
      },
      center.addObserver(
        forName: .AVAudioEngineConfigurationChange,
        object: engine,
        queue: .main
      ) { [weak self] _ in
        MainActor.assumeIsolated { self?.resumeAfterRouteChange() }
      },
      center.addObserver(
        forName: AVAudioSession.mediaServicesWereResetNotification,
        object: session,
        queue: .main
      ) { [weak self] _ in
        MainActor.assumeIsolated { self?.stop() }
      },
    ]
  }

  @MainActor
  private func makeTranscriber() async throws -> ComposerAnalyzerTranscriber {
    let onEvent: ComposerTranscriptHandler = { [weak self] event in self?.receive(event) }
    guard
      let transcriber = await ComposerAnalyzerTranscriber.make(
        locale: Self.dictationLocale,
        onEvent: onEvent
      )
    else { throw DictationError.unavailable }
    return transcriber
  }

  @MainActor
  private func receive(_ event: ComposerTranscriptEvent) {
    guard state != .idle else { return }
    switch event {
    case .volatile(let text):
      withAnimation(ComposerMetrics.typingGrowth) { volatileText = text }
    case .finalized(let text):
      withAnimation(ComposerMetrics.typingGrowth) { volatileText = "" }
      commit(text)
    case .failed:
      commitVolatile()
      settle()
      onError?(composerLocalized("Dictation stopped. What was heard so far is in your message."))
    case .ended:
      commitVolatile()
      settle()
    }
  }

  @MainActor
  private func commit(_ text: String) {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    onTranscript?(trimmed)
  }

  /// The engine's last guess is closer to what was said than nothing.
  @MainActor
  private func commitVolatile() {
    let tail = volatileText
    volatileText = ""
    commit(tail)
  }

  @MainActor
  private func stopEngine() {
    engine.inputNode.removeTap(onBus: 0)
    if engine.isRunning { engine.stop() }
  }

  /// Called on the audio thread for every buffer. It folds each one into a
  /// running peak and only crosses to the main actor once per bar, so a 21ms
  /// buffer cadence does not turn into fifty view updates a second.
  private func accumulate(_ buffer: AVAudioPCMBuffer, sampleRate: Double) {
    guard let channel = buffer.floatChannelData?[0], sampleRate > 0 else { return }
    let frames = Int(buffer.frameLength)
    guard frames > 0 else { return }

    var peak: Float = 0
    vDSP_maxmgv(channel, buffer.stride, &peak, vDSP_Length(frames))
    pendingPeak = max(pendingPeak, Double(peak))
    pendingFrames += Double(frames)

    guard pendingFrames / sampleRate >= Self.meterInterval else { return }
    let sample = Self.normalize(pendingPeak)
    pendingFrames = 0
    pendingPeak = 0
    Task { @MainActor in self.push(sample) }
  }

  /// The curve the React Native meter used, kept intact because it is tuned:
  /// peak amplitude in decibels, a -60 dB floor, and a 1.5x gain that puts full
  /// scale at about -20 dB. Speech peaks land well under 0 dBFS, so mapping the
  /// full range would leave the bars flat; the gain is what makes a normal
  /// speaking voice reach the top of the meter.
  ///
  /// Peak rather than RMS on purpose. RMS sits roughly 10-15 dB below peak for
  /// speech, so the same thresholds read as near-silence and the meter has to
  /// be given a much lower floor — which then makes it twitch at room noise.
  private static func normalize(_ peak: Double) -> Double {
    let decibels = 20 * log10(max(peak, 1e-7))
    let normalized = (decibels + 60) / 60
    return min(1, max(0, normalized * 1.5))
  }

  @MainActor
  private func push(_ sample: Double) {
    guard case .recording = state else { return }
    levels.removeFirst()
    levels.append(sample)
  }

  private func armBackstop() {
    backstop?.cancel()
    backstop = Task { [weak self] in
      try? await Task.sleep(for: Self.finalizeTimeout)
      guard !Task.isCancelled else { return }
      await MainActor.run {
        guard let self, self.state == .finalizing else { return }
        self.commitVolatile()
        self.settle()
        self.onError?(composerLocalized("Transcription took too long. The last few words may be missing."))
      }
    }
  }

  @MainActor
  private func settle() {
    guard state != .idle else { return }
    backstop?.cancel()
    backstop = nil
    transcriber?.cancel()
    transcriber = nil
    for observer in audioObservers { NotificationCenter.default.removeObserver(observer) }
    audioObservers = []
    stopEngine()
    try? AVAudioSession.sharedInstance().setActive(
      false,
      options: .notifyOthersOnDeactivation
    )
    setState(.idle)
    volatileText = ""
    levels = [Double](repeating: 0, count: Self.meterSamples)
    pendingFrames = 0
    pendingPeak = 0
  }
}
