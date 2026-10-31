package sh.superset.liveactivity

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.URL

class AgentRowRecord : Record {
  @Field var id: String = ""
  @Field var workspaceId: String = ""
  @Field var name: String = ""
  @Field var project: String = ""
  @Field var iconFile: String? = null
  @Field var status: String = ""
  @Field var state: String = "working"
  @Field var elapsed: String = ""
  @Field var isQuiet: Boolean = false
}

class AgentSnapshotRecord : Record {
  @Field var rows: List<AgentRowRecord> = emptyList()
  @Field var more: String? = null
  @Field var totalCount: Int = 0
  @Field var topState: String = "working"
  @Field var staleDetail: String? = null
  @Field var machineName: String = ""
  @Field var staleAfterSeconds: Double = 0.0
}

private class DisabledException :
  CodedException("ERR_DISABLED", "Notifications are off", null)

private class BadKeyException(key: String) :
  CodedException("ERR_BAD_KEY", key, null)

private class DecodeException :
  CodedException("ERR_DECODE", "not an image", null)

class LiveActivityModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("No React context")

  override fun definition() = ModuleDefinition {
    Name("LiveActivity")

    Function("areActivitiesEnabled") { AgentCard.isEnabled(context) }

    Function("activeIds") { AgentCard.activeIds(context) }

    AsyncFunction("cacheIcon") Coroutine { key: String, url: String ->
      // The key arrives from JS: a separator or a traversal component would
      // write outside the icons directory.
      val safe = key.replace(Regex("[^A-Za-z0-9._-]"), "_")
      if (safe.isEmpty() || safe == "." || safe == "..") throw BadKeyException(key)
      val file = "$safe.png"
      val target = File(AgentCard.iconsDir(context), file)
      if (target.exists()) return@Coroutine file
      withContext(Dispatchers.IO) {
        val source = URL(url).openStream().use { BitmapFactory.decodeStream(it) }
          ?: throw DecodeException()
        val side = AgentCard.ICON_PX
        val scaled = Bitmap.createScaledBitmap(source, side, side, true)
        val partial = File(target.parentFile, "$file.part")
        FileOutputStream(partial).use { scaled.compress(Bitmap.CompressFormat.PNG, 100, it) }
        partial.renameTo(target)
      }
      file
    }

    AsyncFunction("start") { snapshot: AgentSnapshotRecord ->
      if (!AgentCard.isEnabled(context)) throw DisabledException()
      AgentCard.post(context, snapshot)
    }

    AsyncFunction("update") { id: String, snapshot: AgentSnapshotRecord ->
      if (id in AgentCard.activeIds(context)) AgentCard.post(context, snapshot)
    }

    AsyncFunction("endAll") { AgentCard.end(context) }
  }
}
