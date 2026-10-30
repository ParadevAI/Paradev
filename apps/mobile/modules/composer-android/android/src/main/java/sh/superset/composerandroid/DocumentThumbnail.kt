package sh.superset.composerandroid

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Build
import android.util.Size
import java.io.File
import kotlin.math.max
import kotlin.math.roundToInt

/** The first page of a PDF, or the provider's own preview for other documents. */
object DocumentThumbnail {
  fun render(context: Context, uriString: String, sidePx: Int): String? {
    val uri = Uri.parse(uriString)
    val bitmap = (if (isPdf(context, uri)) pdfPage(context, uri, sidePx) else null)
      ?: providerThumbnail(context, uri, sidePx)
      ?: return null
    val dir = File(context.cacheDir, "composer-thumbs").apply { mkdirs() }
    val file = File(dir, "${(uriString + sidePx).hashCode().toUInt()}.png")
    file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    bitmap.recycle()
    return Uri.fromFile(file).toString()
  }

  private fun isPdf(context: Context, uri: Uri): Boolean =
    uri.path?.endsWith(".pdf", ignoreCase = true) == true ||
      runCatching { context.contentResolver.getType(uri) }.getOrNull() == "application/pdf"

  private fun pdfPage(context: Context, uri: Uri, sidePx: Int): Bitmap? = runCatching {
    context.contentResolver.openFileDescriptor(uri, "r")?.use { descriptor ->
      PdfRenderer(descriptor).use { renderer ->
        if (renderer.pageCount == 0) return@use null
        renderer.openPage(0).use { page ->
          val scale = sidePx.toFloat() / max(page.width, page.height)
          val bitmap = Bitmap.createBitmap(
            max(1, (page.width * scale).roundToInt()),
            max(1, (page.height * scale).roundToInt()),
            Bitmap.Config.ARGB_8888,
          )
          bitmap.eraseColor(Color.WHITE)
          page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
          bitmap
        }
      }
    }
  }.getOrNull()

  private fun providerThumbnail(context: Context, uri: Uri, sidePx: Int): Bitmap? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || uri.scheme != "content") return null
    return runCatching {
      context.contentResolver.loadThumbnail(uri, Size(sidePx, sidePx), null)
    }.getOrNull()
  }
}
