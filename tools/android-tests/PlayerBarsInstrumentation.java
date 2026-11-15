package pixel.tests;

import android.app.Activity;
import android.app.Dialog;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.widget.FrameLayout;

/** Development-only test APK; exercises the real packaged native player view. */
public class PlayerBarsInstrumentation extends Instrumentation {
  private Dialog dialog;
  private FrameLayout content;
  private View surface;
  private Activity activity;

  @Override public void onCreate(Bundle args) { super.onCreate(args); start(); }
  private void check(boolean condition, String message) {
    if (!condition) throw new AssertionError(message);
  }
  private boolean visible(int type) {
    return dialog.getWindow().getDecorView().getRootWindowInsets().isVisible(type);
  }
  private void settle() throws InterruptedException { waitForIdleSync(); Thread.sleep(900); }
  @Override public void onStart() {
    Bundle result = new Bundle();
    try {
      check(android.os.Build.VERSION.SDK_INT >= 30, "Requires API 30+");
      Intent intent = getTargetContext().getPackageManager().getLaunchIntentForPackage(getTargetContext().getPackageName());
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      activity = startActivitySync(intent);
      settle();
      runOnMainSync(() -> {
        dialog = new Dialog(activity, android.R.style.Theme_Material_NoActionBar);
        content = new FrameLayout(activity);
        content.setBackgroundColor(0xff000000);
        dialog.setContentView(content);
        dialog.show();
        dialog.getWindow().setLayout(-1, -1);
        dialog.getWindow().getInsetsController().show(WindowInsets.Type.systemBars());
      });
      settle();
      runOnMainSync(() -> {
        check(visible(WindowInsets.Type.statusBars()), "Fixture status bar must start visible");
        check(visible(WindowInsets.Type.navigationBars()), "Fixture navigation bar must start visible");
        try {
          Class<?> type = getTargetContext().getClassLoader().loadClass("com.dragonflux.pixelnosekai.PlayerSystemBarsView");
          surface = (View) type.getConstructor(android.content.Context.class).newInstance(activity);
          content.addView(surface, new FrameLayout.LayoutParams(1, 1));
        } catch (Exception error) { throw new RuntimeException(error); }
      });
      settle();
      runOnMainSync(() -> {
        check(!visible(WindowInsets.Type.statusBars()), "Player must hide status bar in its Dialog");
        check(!visible(WindowInsets.Type.navigationBars()), "Player must hide navigation bar in its Dialog");
        content.removeView(surface);
      });
      settle();
      runOnMainSync(() -> {
        check(visible(WindowInsets.Type.statusBars()), "Detaching player must restore status bar");
        check(visible(WindowInsets.Type.navigationBars()), "Detaching player must restore navigation bar");
        dialog.dismiss();
      });
      result.putString("stream", "PASS: real player Dialog hides and restores both Android system bars.\n");
      finish(Activity.RESULT_OK, result);
    } catch (Throwable failure) {
      runOnMainSync(() -> { if (dialog != null) dialog.dismiss(); });
      result.putString("stream", "FAIL: " + failure.toString() + "\n");
      finish(Activity.RESULT_CANCELED, result);
    }
  }
}
