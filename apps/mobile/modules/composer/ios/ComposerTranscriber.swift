import AVFoundation

/// What a speech engine reports while dictation runs.
///
/// `volatile` is the engine's current guess at words not yet settled; each one
/// replaces the last. `finalized` text will not change again and is safe to put
/// in the draft.
enum ComposerTranscriptEvent {
  case volatile(String)
  case finalized(String)
  case failed(Error)
  /// The engine has flushed everything it heard. Nothing follows this.
  case ended
}

/// One speech engine behind `ComposerDictation`.
///
/// Two exist because `SpeechTranscriber` covers fewer languages than
/// `SFSpeechRecognizer`. See `ComposerAnalyzerTranscriber` and
/// `ComposerRecognizerTranscriber`.
protocol ComposerTranscriber: AnyObject {
  /// Called on the audio tap thread for every buffer.
  func append(_ buffer: AVAudioPCMBuffer)
  /// No more audio. Events continue until `.ended` or `.failed`.
  @MainActor func finish()
  /// Stop now. No further events are delivered.
  @MainActor func cancel()
}

typealias ComposerTranscriptHandler = @MainActor (ComposerTranscriptEvent) -> Void
