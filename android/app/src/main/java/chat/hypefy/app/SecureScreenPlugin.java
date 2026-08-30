package chat.hypefy.app;

import android.view.WindowManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Blocks screenshots and screen recording for the whole window.
 *
 * This is the OneShot guarantee the web build cannot make. A browser has no
 * screenshot API to detect or prevent capture, so on the web the product can
 * only ask nicely. FLAG_SECURE is enforced by the OS: the screen goes black
 * in screenshots, in the recents list, and on screen recorders.
 *
 * Applied to the window rather than a single view because the WebView draws
 * everything, so there is no per-element granularity available — the window
 * is the only unit Android will secure.
 */
@CapacitorPlugin(name = "SecureScreen")
public class SecureScreenPlugin extends Plugin {

    @PluginMethod
    public void enable(PluginCall call) {
        // Window flags must be touched on the UI thread; a plugin call arrives
        // on a bridge thread, so this would throw without the hop.
        getActivity().runOnUiThread(() -> {
            getActivity().getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE
            );
            call.resolve();
        });
    }

    @PluginMethod
    public void disable(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            call.resolve();
        });
    }

    /** Lets the web layer confirm the capability exists before promising it. */
    @PluginMethod
    public void isSupported(PluginCall call) {
        com.getcapacitor.JSObject ret = new com.getcapacitor.JSObject();
        ret.put("supported", true);
        call.resolve(ret);
    }
}
