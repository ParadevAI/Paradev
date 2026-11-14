package sh.superset.liveactivity

import android.app.AlarmManager
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
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
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
  const val EXTRA_STALE = "stale"
  /** Notification large icons draw at 48dp; 144px covers xxxhdpi at 3x. */
  const val ICON_PX = 144
  private const val CHANNEL_ID = "agent-status"
  private const val SEPARATOR = " · "
  /** Android shows at most three notification actions. */
  private const val MAX_ACTIONS = 3

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
      .notify(TAG, NOTIFICATION_ID, build(context, snapshot, stale = false))
    scheduleStale(context, snapshot)
    return TAG
  }

  fun end(context: Context) {
    context.getSystemService(AlarmManager::class.java).cancel(staleIntent(context, null))
    NotificationManagerCompat.from(context).cancel(TAG, NOTIFICATION_ID)
  }

  /** Never brings back a card the user swiped away or the app ended. */
  fun showStale(context: Context, notification: Notification) {
    if (activeIds(context).isEmpty()) return
    context.getSystemService(NotificationManager::class.java)
      .notify(TAG, NOTIFICATION_ID, notification)
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

  /**
   * Updates come only from the app in the foreground, so the "Not updating"
   * form is built now and posted by an alarm if no newer post replaces it.
   */
  private fun scheduleStale(context: Context, snapshot: AgentSnapshotRecord) {
    val alarms = context.getSystemService(AlarmManager::class.java)
    if (snapshot.staleDetail.isNullOrEmpty() || snapshot.staleAfterSeconds <= 0) {
      alarms.cancel(staleIntent(context, null))
      return
    }
    val stale = build(context, snapshot, stale = true)
    val at = SystemClock.elapsedRealtime() + (snapshot.staleAfterSeconds * 1000).toLong()
    alarms.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME, at, staleIntent(context, stale))
  }

  private fun staleIntent(context: Context, stale: Notification?): PendingIntent {
    val intent = Intent(context, StaleCardReceiver::class.java)
    stale?.let { intent.putExtra(EXTRA_STALE, it) }
    return PendingIntent.getBroadcast(
      context,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun build(context: Context, snapshot: AgentSnapshotRecord, stale: Boolean): Notification {
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
    val collapsed = if (rows.size <= 1) {
      topMeta
    } else {
      (rows.drop(1).joinToString(", ") { it.name } + (snapshot.more?.let { " $it" } ?: ""))
    }

    builder
      .setSmallIcon(R.drawable.agent_card_mark)
      .setContentTitle(title)
      .setContentText(collapsed)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(Notification.CATEGORY_STATUS)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setShowWhen(true)
      .setWhen(System.currentTimeMillis())
      .setContentIntent(openIntent(context, rows.singleOrNull(), 0))
    if (stale) builder.setSubText(snapshot.staleDetail)
    stateColor[snapshot.topState]?.let { builder.setColor(it) }
    top?.iconFile?.let { file ->
      BitmapFactory.decodeFile(File(iconsDir(context), file).path)?.let(builder::setLargeIcon)
    }

    if (canPromote(context)) {
      // A custom layout cannot be promoted, so a Live Update keeps the text
      // template and gives the top rows their own tap targets as actions.
      val others = rows.drop(1).map { listOf(it.status, it.name, it.elapsed).joinToString(SEPARATOR) }
      val expanded = (listOf(topMeta) + others + listOfNotNull(snapshot.more))
        .filter(String::isNotEmpty)
        .joinToString("\n")
      builder.setStyle(Notification.BigTextStyle().bigText(expanded))
      if (rows.size > 1) {
        rows.take(MAX_ACTIONS).forEachIndexed { index, row ->
          builder.addAction(
            Notification.Action.Builder(null, row.name, openIntent(context, row, index + 1)).build(),
          )
        }
      }
      builder.setRequestPromotedOngoing(true)
      top?.let { builder.setShortCriticalText(if (stale) snapshot.staleDetail else it.status) }
    } else {
      builder
        .setStyle(Notification.DecoratedCustomViewStyle())
        .setCustomBigContentView(rowsView(context, snapshot))
    }
    return builder.build()
  }

  private fun canPromote(context: Context): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.BAKLAVA &&
      context.getSystemService(NotificationManager::class.java).canPostPromotedNotifications()

  private fun rowsView(context: Context, snapshot: AgentSnapshotRecord): RemoteViews {
    val view = RemoteViews(context.packageName, R.layout.agent_card_rows)
    snapshot.rows.forEachIndexed { index, row ->
      val rowView = RemoteViews(context.packageName, R.layout.agent_card_row).apply {
        setTextViewText(R.id.agent_card_row_status, row.status)
        stateColor[row.state]?.let { setTextColor(R.id.agent_card_row_status, it) }
        setTextViewText(R.id.agent_card_row_name, row.name)
        setTextViewText(R.id.agent_card_row_project, row.project)
        setViewVisibility(
          R.id.agent_card_row_project,
          if (row.project.isEmpty()) View.GONE else View.VISIBLE,
        )
        setTextViewText(R.id.agent_card_row_elapsed, row.elapsed)
        setOnClickPendingIntent(R.id.agent_card_row, openIntent(context, row, index + 1))
      }
      view.addView(R.id.agent_card_rows, rowView)
    }
    snapshot.more?.let {
      view.setTextViewText(R.id.agent_card_more, it)
      view.setViewVisibility(R.id.agent_card_more, View.VISIBLE)
    }
    return view
  }

  /** Opens the row's session, or Home when the tap is not on one agent. */
  private fun openIntent(context: Context, row: AgentRowRecord?, requestCode: Int): PendingIntent {
    val uri = if (row != null) {
      Uri.parse("superset:///workspace/${Uri.encode(row.workspaceId)}?tab=${Uri.encode(row.id)}")
    } else {
      Uri.parse("superset:///")
    }
    val intent = Intent(Intent.ACTION_VIEW, uri).setPackage(context.packageName)
    return PendingIntent.getActivity(
      context,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }
}
