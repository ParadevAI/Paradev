package sh.superset.composerandroid

import android.Manifest
import android.content.ClipboardManager
import android.content.Context
import android.speech.SpeechRecognizer
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ComposerAndroidModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private var dictation: Dictation? = null

  private val clipboard: ClipboardManager
    get() = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager

  private val clipListener = ClipboardManager.OnPrimaryClipChangedListener {
    sendEvent("onClipboardChange", mapOf("hasAttachments" to ClipboardAttachments.available(clipboard)))
  }

  override fun definition() = ModuleDefinition {
    Name("ComposerAndroid")

    Events(
      "onDictationPartial",
      "onDictationFinal",
      "onDictationLevel",
      "onDictationError",
      "onDictationEnd",
      "onClipboardChange",
    )

    Function("isDictationAvailable") {
      SpeechRecognizer.isRecognitionAvailable(context)
    }

    AsyncFunction("requestMicrophonePermission") { promise: Promise ->
      Permissions.askForPermissionsWithPermissionsManager(
        appContext.permissions,
        promise,
        Manifest.permission.RECORD_AUDIO,
      )
    }

    AsyncFunction("startDictation") { locale: String? ->
      dictation?.cancel()
      dictation = Dictation(context, locale, ::sendEvent).also { it.start() }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stopDictation") {
      dictation?.stop()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("cancelDictation") {
      dictation?.cancel()
      dictation = null
    }.runOnQueue(Queues.MAIN)

    Function("clipboardHasAttachments") {
      ClipboardAttachments.available(clipboard)
    }

    AsyncFunction("readClipboardAttachments") {
      ClipboardAttachments.read(context, clipboard)
    }

    AsyncFunction("documentThumbnail") { uri: String, sidePx: Int ->
      DocumentThumbnail.render(context, uri, sidePx)
    }

    OnStartObserving {
      clipboard.addPrimaryClipChangedListener(clipListener)
    }

    OnStopObserving {
      clipboard.removePrimaryClipChangedListener(clipListener)
    }

    OnDestroy {
      dictation?.cancel()
      dictation = null
    }
  }
}
