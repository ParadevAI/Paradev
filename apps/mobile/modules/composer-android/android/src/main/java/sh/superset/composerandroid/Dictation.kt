package sh.superset.composerandroid

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.SystemClock
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

/**
 * One dictation, from the mic tap to stop. The platform recogniser ends a
 * session after a pause, so this starts it again until stop: the composer
 * keeps listening the way iOS does.
 */
class Dictation(
  private val context: Context,
  private val locale: String?,
  private val emit: (String, Map<String, Any?>) -> Unit,
) : RecognitionListener {
  private var recognizer: SpeechRecognizer? = null
  private var listening = false
  private var finished = false
  private var lastLevelAt = 0L

  fun start() {
    listening = true
    recognizer = SpeechRecognizer.createSpeechRecognizer(context).also {
      it.setRecognitionListener(this)
    }
    listen()
  }

  fun stop() {
    if (!listening) return
    listening = false
    recognizer?.stopListening()
  }

  fun cancel() {
    listening = false
    recognizer?.cancel()
    finish()
  }

  private fun listen() {
    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
      locale?.let { putExtra(RecognizerIntent.EXTRA_LANGUAGE, it) }
    }
    recognizer?.startListening(intent)
  }

  private fun finish() {
    if (finished) return
    finished = true
    recognizer?.destroy()
    recognizer = null
    emit("onDictationEnd", emptyMap())
  }

  private fun firstResult(results: Bundle?): String =
    results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()

  override fun onPartialResults(partialResults: Bundle?) {
    val text = firstResult(partialResults)
    if (text.isNotEmpty()) emit("onDictationPartial", mapOf("text" to text))
  }

  override fun onResults(results: Bundle?) {
    val text = firstResult(results)
    if (text.isNotEmpty()) emit("onDictationFinal", mapOf("text" to text))
    if (listening) listen() else finish()
  }

  override fun onError(error: Int) {
    val quiet = error == SpeechRecognizer.ERROR_NO_MATCH ||
      error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
    if (quiet && listening) {
      listen()
      return
    }
    if (!quiet && error != SpeechRecognizer.ERROR_CLIENT) {
      emit("onDictationError", mapOf("code" to errorCode(error)))
    }
    listening = false
    finish()
  }

  override fun onRmsChanged(rmsdB: Float) {
    val now = SystemClock.elapsedRealtime()
    if (now - lastLevelAt < LEVEL_INTERVAL_MS) return
    lastLevelAt = now
    emit("onDictationLevel", mapOf("level" to ((rmsdB + 2f) / 12f).coerceIn(0f, 1f)))
  }

  override fun onReadyForSpeech(params: Bundle?) {}
  override fun onBeginningOfSpeech() {}
  override fun onBufferReceived(buffer: ByteArray?) {}
  override fun onEndOfSpeech() {}
  override fun onEvent(eventType: Int, params: Bundle?) {}

  private fun errorCode(error: Int): String = when (error) {
    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "permission"
    SpeechRecognizer.ERROR_NETWORK,
    SpeechRecognizer.ERROR_NETWORK_TIMEOUT,
    SpeechRecognizer.ERROR_SERVER,
    SpeechRecognizer.ERROR_SERVER_DISCONNECTED -> "network"
    SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "busy"
    SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED,
    SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> "language"
    else -> "failed"
  }

  private companion object {
    const val LEVEL_INTERVAL_MS = 100L
  }
}
