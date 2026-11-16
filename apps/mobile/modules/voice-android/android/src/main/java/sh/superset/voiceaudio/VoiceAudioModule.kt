package sh.superset.voiceaudio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Owns the audio route for the length of a voice call, as `VoiceAudioModule`
 * does on iOS: communication mode, audio focus, the speaker unless a headset
 * is connected, and events when Android takes the audio or the route moves.
 * Port names follow iOS (`Speaker`, `Receiver`, `BluetoothHFP`, ...).
 */
class VoiceAudioModule : Module() {
  private val audioManager: AudioManager
    get() = (appContext.reactContext ?: throw Exceptions.ReactContextLost())
      .getSystemService(Context.AUDIO_SERVICE) as AudioManager

  private val mainHandler = Handler(Looper.getMainLooper())
  private var focusRequest: AudioFocusRequest? = null
  private var focusHeld = false
  private var observing = false
  private var speakerPreferred = true

  private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
    when (change) {
      AudioManager.AUDIOFOCUS_LOSS,
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK ->
        sendEvent("onInterruption", mapOf("phase" to "began", "shouldResume" to false))
      AudioManager.AUDIOFOCUS_GAIN ->
        sendEvent("onInterruption", mapOf("phase" to "ended", "shouldResume" to true))
    }
  }

  private val deviceCallback = object : AudioDeviceCallback() {
    override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) =
      routeChanged("newDeviceAvailable")

    override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) =
      routeChanged("oldDeviceUnavailable")
  }

  override fun definition() = ModuleDefinition {
    Name("VoiceAudio")

    Events("onInterruption", "onRouteChange")

    AsyncFunction("configure") {
      val manager = audioManager
      manager.mode = AudioManager.MODE_IN_COMMUNICATION
      requestFocus(manager)
      speakerPreferred = true
      applyRoute(manager)
      if (!observing) {
        observing = true
        manager.registerAudioDeviceCallback(deviceCallback, mainHandler)
      }
    }

    AsyncFunction("preferSpeaker") { on: Boolean ->
      speakerPreferred = on
      applyRoute(audioManager)
    }

    AsyncFunction("release") {
      releaseAudio()
    }

    Function("currentRoute") {
      outputs(audioManager)
    }

    OnDestroy {
      runCatching { releaseAudio() }
    }
  }

  private fun requestFocus(manager: AudioManager) {
    if (focusRequest != null || focusHeld) return
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      @Suppress("DEPRECATION")
      manager.requestAudioFocus(focusListener, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN)
      focusHeld = true
      return
    }
    val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build(),
      )
      .setOnAudioFocusChangeListener(focusListener, mainHandler)
      .build()
    manager.requestAudioFocus(request)
    focusRequest = request
  }

  private fun releaseAudio() {
    val manager = audioManager
    if (observing) {
      observing = false
      manager.unregisterAudioDeviceCallback(deviceCallback)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focusRequest?.let { manager.abandonAudioFocusRequest(it) }
    } else if (focusHeld) {
      @Suppress("DEPRECATION")
      manager.abandonAudioFocus(focusListener)
    }
    focusRequest = null
    focusHeld = false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      manager.clearCommunicationDevice()
    } else {
      @Suppress("DEPRECATION")
      manager.isSpeakerphoneOn = false
    }
    manager.mode = AudioManager.MODE_NORMAL
  }

  private fun routeChanged(reason: String) {
    val manager = audioManager
    if (focusRequest != null || focusHeld) applyRoute(manager)
    sendEvent("onRouteChange", mapOf("reason" to reason, "outputs" to outputs(manager)))
  }

  private fun applyRoute(manager: AudioManager) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val devices = manager.availableCommunicationDevices
      val headset = HEADSET_TYPES.firstNotNullOfOrNull { type -> devices.firstOrNull { it.type == type } }
      val fallback = if (speakerPreferred) AudioDeviceInfo.TYPE_BUILTIN_SPEAKER else AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
      val target = headset ?: devices.firstOrNull { it.type == fallback }
      if (target != null) manager.setCommunicationDevice(target) else manager.clearCommunicationDevice()
    } else {
      val headset = manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any { it.type in HEADSET_TYPES }
      @Suppress("DEPRECATION")
      manager.isSpeakerphoneOn = speakerPreferred && !headset
    }
  }

  private fun outputs(manager: AudioManager): List<String> {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      return listOfNotNull(manager.communicationDevice?.let { portName(it.type) })
    }
    @Suppress("DEPRECATION")
    if (manager.isSpeakerphoneOn) return listOf("Speaker")
    val headset = manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).firstOrNull { it.type in HEADSET_TYPES }
    return listOf(headset?.let { portName(it.type) } ?: "Receiver")
  }

  private fun portName(type: Int): String = when (type) {
    AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "Speaker"
    AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "Receiver"
    AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "BluetoothHFP"
    AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "BluetoothA2DPOutput"
    AudioDeviceInfo.TYPE_BLE_HEADSET -> "BluetoothLE"
    AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "Headphones"
    AudioDeviceInfo.TYPE_USB_HEADSET -> "USBAudio"
    else -> "Unknown"
  }

  private companion object {
    val HEADSET_TYPES = listOf(
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
      AudioDeviceInfo.TYPE_BLE_HEADSET,
      AudioDeviceInfo.TYPE_WIRED_HEADSET,
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
      AudioDeviceInfo.TYPE_USB_HEADSET,
    )
  }
}
