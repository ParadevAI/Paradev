package sh.superset.composerandroid

import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import java.io.File
import java.util.UUID

/**
 * Images and files on the clipboard, copied into the cache so the tray gets
 * file URIs the way the pickers give them. Reading only the description keeps
 * Android's "pasted from clipboard" toast for the paste itself.
 */
object ClipboardAttachments {
  fun available(clipboard: ClipboardManager): Boolean {
    val description = clipboard.primaryClipDescription ?: return false
    return (0 until description.mimeTypeCount).any { index ->
      val mime = description.getMimeType(index)
      !mime.startsWith("text/") && mime != ClipDescription.MIMETYPE_TEXT_INTENT
    }
  }

  fun read(context: Context, clipboard: ClipboardManager): List<Map<String, String>> {
    val clip = clipboard.primaryClip ?: return emptyList()
    val resolver = context.contentResolver
    val dir = File(context.cacheDir, "composer-paste/${UUID.randomUUID()}").apply { mkdirs() }
    return (0 until clip.itemCount).mapNotNull { index ->
      val uri = clip.getItemAt(index).uri ?: return@mapNotNull null
      val mime = resolver.getType(uri) ?: return@mapNotNull null
      if (mime.startsWith("text/")) return@mapNotNull null
      val name = displayName(context, uri) ?: fallbackName(index, mime)
      val target = File(dir, name.replace('/', '_'))
      val copied = runCatching {
        resolver.openInputStream(uri)?.use { input ->
          target.outputStream().use { output -> input.copyTo(output) }
        }
      }.getOrNull()
      if (copied == null) return@mapNotNull null
      mapOf(
        "uri" to Uri.fromFile(target).toString(),
        "name" to target.name,
        "kind" to if (mime.startsWith("image/")) "image" else "file",
      )
    }
  }

  private fun displayName(context: Context, uri: Uri): String? =
    runCatching {
      context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
        ?.use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null }
    }.getOrNull()?.takeIf { it.isNotBlank() }

  private fun fallbackName(index: Int, mime: String): String {
    val extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime) ?: "bin"
    return "pasted-${index + 1}.$extension"
  }
}
