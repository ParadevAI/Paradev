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

enum ComposerDictatedText {
  /// Joins two stretches of speech with a space, except where the script does
  /// not separate words (Chinese, Japanese) or the next part is punctuation.
  static func join(_ head: String, _ tail: String) -> String {
    guard let last = head.last, let first = tail.first else { return head + tail }
    if last.isWhitespace || first.isWhitespace || first.isPunctuation { return head + tail }
    if isUnspaced(last) || isUnspaced(first) { return head + tail }
    return head + " " + tail
  }

  private static func isUnspaced(_ character: Character) -> Bool {
    character.unicodeScalars.contains { scalar in
      scalar.properties.isIdeographic
        || (0x3040...0x30FF).contains(scalar.value)
        || (0x3000...0x303F).contains(scalar.value)
        || (0xFF00...0xFFEF).contains(scalar.value)
    }
  }
}
