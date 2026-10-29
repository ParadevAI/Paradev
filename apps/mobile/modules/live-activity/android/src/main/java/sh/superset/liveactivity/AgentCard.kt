package sh.superset.liveactivity

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationManagerCompat
import java.io.File

/**
 * The Android form of the Lock Screen card: one ongoing notification. On
 * Android 16+ it asks to be promoted to a Live Update, which pins it to the
 * top of the shade and the Lock Screen and adds a status bar chip.
 */
internal object AgentCard {
  const val TAG = "agent-card"
  const val NOTIFICATION_ID = 1
  /** Notification large icons draw at 48dp; 144px covers xxxhdpi at 3x. */
  const val ICON_PX = 144
  private const val CHANNEL_ID = "agent-status"
  private const val SEPARATOR = " · "

  private val stateColor = mapOf(
    "permission" to Color.rgb(228, 182, 92),
    "failed" to Color.rgb(228, 124, 117),
    "review" to Color.rgb(115, 191, 136),
  )

  fun iconsDir(context: Context): File =
    File(context.cacheDir, "agent-card-icons").apply { mkdirs() }

  fun isEnabled(context: Context): Boolean {
    val manager = NotificationManagerCompat.from(context)
    if (!manager.areNotificationsEnabled()) return false
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true
    val channel = manager.getNotificationChannel(CHANNEL_ID) ?: return true
    return channel.importance != NotificationManager.IMPORTANCE_NONE
  }

  fun activeIds(context: Context): List<String> {
    val manager = context.getSystemService(NotificationManager::class.java)
    return manager.activeNotifications
      .filter { it.tag == TAG && it.id == NOTIFICATION_ID }
      .map { TAG }
  }

  fun post(context: Context, snapshot: AgentSnapshotRecord): String {
    ensureChannel(context)
    context.getSystemService(NotificationManager::class.java)
      .notify(TAG, NOTIFICATION_ID, build(context, snapshot))
    return TAG
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    // LOW: the card changes every few seconds and must never sound. A Live
    // Update cannot use MIN.
    val channel = NotificationChannel(
      CHANNEL_ID,
      context.getString(R.string.agent_card_channel),
      NotificationManager.IMPORTANCE_LOW,
    ).apply { setShowBadge(false) }
    context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  private fun build(context: Context, snapshot: AgentSnapshotRecord): Notification {
    val rows = snapshot.rows
    val top = rows.firstOrNull()
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(context)
    }
    val title = top?.let { "${it.status}$SEPARATOR${it.name}" } ?: ""
    val topMeta = top?.let { listOf(it.project, it.elapsed).filter(String::isNotEmpty) }
      ?.joinToString(SEPARATOR) ?: ""
    val others = rows.drop(1).map { listOf(it.status, it.name, it.elapsed).joinToString(SEPARATOR) }
    val collapsed = if (others.isEmpty()) {
      topMeta
    } else {
      (rows.drop(1).joinToString(", ") { it.name } + (snapshot.more?.let { " $it" } ?: ""))
    }
    val expanded = (listOf(topMeta) + others + listOfNotNull(snapshot.more))
      .filter(String::isNotEmpty)
      .joinToString("\n")

    builder
      .setSmallIcon(R.drawable.agent_card_mark)
      .setContentTitle(title)
      .setContentText(collapsed)
      .setStyle(Notification.BigTextStyle().bigText(expanded))
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(Notification.CATEGORY_STATUS)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      // Updates arrive only while the app is in the foreground. The shade's
      // own "5m" next to the app name is how the card admits it is old.
      .setShowWhen(true)
      .setWhen(System.currentTimeMillis())
      .setContentIntent(openIntent(context, rows))
    stateColor[snapshot.topState]?.let { builder.setColor(it) }
    top?.iconFile?.let { file ->
      BitmapFactory.decodeFile(File(iconsDir(context), file).path)?.let(builder::setLargeIcon)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.BAKLAVA) {
      builder.setRequestPromotedOngoing(true)
      top?.let { builder.setShortCriticalText(it.status) }
    }
    return builder.build()
  }

  /**
   * A notification has one tap target, so a single agent opens its session
   * and several open Home, the same fallback the iOS card uses around rows.
   */
  private fun openIntent(context: Context, rows: List<AgentRowRecord>): PendingIntent {
    val only = rows.singleOrNull()
    val uri = if (only != null) {
      Uri.parse("superset:///workspace/${Uri.encode(only.workspaceId)}?tab=${Uri.encode(only.id)}")
    } else {
      Uri.parse("superset:///")
    }
    val intent = Intent(Intent.ACTION_VIEW, uri).setPackage(context.packageName)
    return PendingIntent.getActivity(
      context,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }
}
