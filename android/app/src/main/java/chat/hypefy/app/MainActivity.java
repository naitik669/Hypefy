package chat.hypefy.app;

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
    }
}
