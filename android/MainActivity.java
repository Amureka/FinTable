package app.fintable.local;

import android.app.Activity;
import android.content.res.AssetManager;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.MimeTypeMap;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String ENTRY = "https://" + HOST + "/app/index.html";
    private WebView webView;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(248, 247, 251));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.setWebViewClient(new LocalContentClient(getAssets()));

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);
        root.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets safeArea = insets.getInsets(WindowInsets.Type.systemBars()
                    | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(safeArea.left, safeArea.top, safeArea.right, safeArea.bottom);
                return WindowInsets.CONSUMED;
            });
        }
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                int lightBars = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                    | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                controller.setSystemBarsAppearance(lightBars, lightBars);
            }
            root.requestApplyInsets();
        }
        if (state == null || webView.restoreState(state) == null) {
            webView.loadUrl(ENTRY);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        webView.saveState(state);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    private static final class LocalContentClient extends WebViewClient {
        private final AssetManager assets;

        LocalContentClient(AssetManager assets) {
            this.assets = assets;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return !isLocal(request.getUrl());
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (isLocal(url) && "GET".equals(request.getMethod())) {
                String path = url.getPath();
                String mimeType = mimeType(path);
                String encoding = mimeType.startsWith("text/") ? "UTF-8" : null;
                try {
                    return new WebResourceResponse(mimeType, encoding,
                        assets.open(path.substring(1), AssetManager.ACCESS_STREAMING));
                } catch (IOException ignored) {
                    // Vite assets that are absent should return 404.
                }
            }
            return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                null, new ByteArrayInputStream(new byte[0]));
        }

        private static boolean isLocal(Uri url) {
            String path = url.getPath();
            return "https".equals(url.getScheme()) && HOST.equals(url.getAuthority())
                && path != null && path.startsWith("/app/")
                && !path.contains("..") && !path.contains("\\");
        }

        private static String mimeType(String path) {
            int lastDot = path.lastIndexOf('.');
            if (lastDot < 0) return "application/octet-stream";
            String extension = path.substring(lastDot + 1).toLowerCase(Locale.ROOT);
            if ("js".equals(extension) || "mjs".equals(extension)) return "text/javascript";
            String type = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
            return type != null ? type : "application/octet-stream";
        }
    }
}
