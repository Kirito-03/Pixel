package pixel.reader.tests;
import android.app.Activity;
import android.app.Dialog;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.JavascriptInterface;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;
import org.json.JSONTokener;

/** Tests the production HTML renderer with non-content SVG fixtures in Android WebView. */
public class MangaReaderInstrumentation extends Instrumentation {
  Dialog dialog;
  WebView reader;
  volatile String evaluated;
  @Override public void onCreate(Bundle args) { super.onCreate(args); start(); }
  public class Bridge { @JavascriptInterface public void postMessage(String value) {} }
  @Override public void onStart() {
    Bundle result = new Bundle();
    try {
      Intent launch = getTargetContext().getPackageManager().getLaunchIntentForPackage(getTargetContext().getPackageName());
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      Activity activity = startActivitySync(launch);
      String html;
      try (java.io.InputStream input = getContext().getAssets().open("reader.html")) { html = new String(input.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8); }
      final String document = html;
      CountDownLatch loaded = new CountDownLatch(1);
      runOnMainSync(() -> {
        dialog = new Dialog(activity, android.R.style.Theme_Material_NoActionBar);
        reader = new WebView(activity);
        reader.getSettings().setJavaScriptEnabled(true);
        reader.addJavascriptInterface(new Bridge(), "ReactNativeWebView");
        reader.setWebViewClient(new WebViewClient() { @Override public void onPageFinished(WebView view, String url) { loaded.countDown(); } });
        dialog.setContentView(reader); dialog.show(); dialog.getWindow().setLayout(-1,-1);
        reader.loadDataWithBaseURL("https://pixelnosekai.com", document, "text/html", "UTF-8", null);
      });
      if (!loaded.await(30,TimeUnit.SECONDS)) throw new AssertionError("HTML load timed out");
      Thread.sleep(1500);
      CountDownLatch checked = new CountDownLatch(1);
      runOnMainSync(() -> reader.evaluateJavascript("JSON.stringify({loaded:document.querySelector('img').complete,width:document.querySelector('img').naturalWidth,height:document.querySelector('img').naturalHeight,navs:document.querySelectorAll('nav').length,buttons:document.querySelectorAll('nav button:not(:disabled)').length,pageHeight:document.querySelector('.page').getBoundingClientRect().height,activeFunction:typeof window.pixelReaderActive})", value -> { evaluated=value; checked.countDown(); }));
      if (!checked.await(10,TimeUnit.SECONDS)) throw new AssertionError("DOM check timed out");
      JSONObject state = new JSONObject((String)new JSONTokener(evaluated).nextValue());
      if (!state.getBoolean("loaded") || state.getInt("width")!=720 || state.getInt("height")!=12000 || state.getInt("navs")!=2 || state.getInt("buttons")!=4 || state.getDouble("pageHeight")<3000 || !state.getString("activeFunction").equals("function")) throw new AssertionError(state.toString());
      result.putString("stream", "PASS: Android WebView keeps 720x12000 source dimensions, renders the long page, both chapter navigation bars and retry control. "+state.toString()+"\n");
      runOnMainSync(() -> { dialog.dismiss(); reader.destroy(); });
      finish(Activity.RESULT_OK,result);
    } catch(Throwable error) {
      runOnMainSync(() -> { if(dialog!=null)dialog.dismiss(); if(reader!=null)reader.destroy(); });
      result.putString("stream","FAIL: "+error.toString()+"\n");finish(Activity.RESULT_CANCELED,result);
    }
  }
}
