package com.vercro.app;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;

import android.content.Intent;
import android.util.Log;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN
                && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            PluginHandle pluginHandle = getBridge().getPlugin("SocialLogin");
            if (pluginHandle == null) {
                Log.e("MainActivity", "SocialLogin plugin not found");
                return;
            }
            if (!(pluginHandle.getInstance() instanceof SocialLoginPlugin)) {
                Log.e("MainActivity", "SocialLogin plugin instance not found");
                return;
            }
            SocialLoginPlugin socialLoginPlugin = (SocialLoginPlugin) pluginHandle.getInstance();
            socialLoginPlugin.handleGoogleLoginIntent(requestCode, data);
        }
    }
}
