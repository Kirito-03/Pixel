package com.dragonflux.pixelnosekai

import android.content.Context
import android.os.Build
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManager

/** Scoped to the actual player window, including React Native Modal dialogs. */
class PlayerSystemBarsView(context: Context) : View(context) {
  private var controller: WindowInsetsController? = null
  private var restoreTypes = 0
  private var previousBehavior = 0
  private var legacyRoot: View? = null
  private var previousFlags = 0

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (Build.VERSION.SDK_INT >= 30) {
      controller = windowInsetsController
      val insets = rootWindowInsets
      if (insets?.isVisible(WindowInsets.Type.statusBars()) == true) restoreTypes = restoreTypes or WindowInsets.Type.statusBars()
      if (insets?.isVisible(WindowInsets.Type.navigationBars()) == true) restoreTypes = restoreTypes or WindowInsets.Type.navigationBars()
      previousBehavior = controller?.systemBarsBehavior ?: 0
    } else {
      legacyRoot = rootView
      @Suppress("DEPRECATION")
      previousFlags = rootView.systemUiVisibility
    }
    post { hideBars() }
  }

  private fun hideBars() {
    if (!isAttachedToWindow) return
    if (Build.VERSION.SDK_INT >= 30) {
      controller?.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      controller?.hide(WindowInsets.Type.systemBars())
    } else {
      @Suppress("DEPRECATION")
      legacyRoot?.systemUiVisibility = previousFlags or View.SYSTEM_UI_FLAG_FULLSCREEN or
        View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
    }
  }

  override fun onWindowFocusChanged(hasWindowFocus: Boolean) {
    super.onWindowFocusChanged(hasWindowFocus)
    if (hasWindowFocus) post { hideBars() }
  }

  override fun onDetachedFromWindow() {
    if (Build.VERSION.SDK_INT >= 30) {
      controller?.systemBarsBehavior = previousBehavior
      controller?.show(restoreTypes)
      controller = null
    } else {
      @Suppress("DEPRECATION")
      legacyRoot?.systemUiVisibility = previousFlags
      legacyRoot = null
    }
    super.onDetachedFromWindow()
  }
}

class PlayerSystemBarsManager : SimpleViewManager<PlayerSystemBarsView>() {
  override fun getName() = "PixelPlayerSystemBars"
  override fun createViewInstance(context: ThemedReactContext) = PlayerSystemBarsView(context)
}

class PlayerSystemBarsPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = emptyList()
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = listOf(PlayerSystemBarsManager())
}
