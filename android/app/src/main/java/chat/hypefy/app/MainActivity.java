package chat.hypefy.app;

import android.graphics.Color;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins must be registered before super.onCreate() builds the bridge.
        registerPlugin(SecureScreenPlugin.class);
        super.onCreate(savedInstanceState);

        // No scrollbar line on the right edge while scrolling. That line is
        // drawn by Android's WebView itself, so the page's CSS can't hide it.
        WebView webView = getBridge().getWebView();
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);

        // Transparent until the page paints, so what shows through the whole
        // launch is the window's own Hypefy artwork (AppTheme.NoActionBar)
        // rather than the WebView's default blank sheet. Every page of the app
        // paints an opaque background over it, so nothing shows through after.
        webView.setBackgroundColor(Color.TRANSPARENT);
    }
}
