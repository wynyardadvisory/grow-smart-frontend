package com.vercro.app;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.Plugin;

import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;

import android.content.Intent;
import android.util.Log;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {

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
            Plugin plugin = pluginHandle.getInstance();
            if (!(plugin instanceof SocialLoginPlugin)) {
                Log.e("MainActivity", "SocialLogin plugin instance not found");
                return;
            }
            ((SocialLoginPlugin) plugin).onActivityResult(requestCode, resultCode, data);
        }
    }
}
