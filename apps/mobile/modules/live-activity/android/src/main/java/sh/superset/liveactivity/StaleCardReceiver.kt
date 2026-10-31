package sh.superset.liveactivity

import android.app.Notification
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/** Swaps the card for its "Not updating" form when the app stops feeding it. */
class StaleCardReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val stale = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(AgentCard.EXTRA_STALE, Notification::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(AgentCard.EXTRA_STALE)
    } ?: return
    AgentCard.showStale(context, stale)
  }
}
