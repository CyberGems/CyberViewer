'use strict';

// Help link targets shared by the tray menu dispatcher in main.js.
const TRAY_HELP_URLS = Object.freeze({
  docs: 'https://github.com/CyberGems/CyberViewer/wiki',
  faq: 'https://github.com/CyberGems/CyberViewer/wiki/FAQ',
  changelog: 'https://github.com/CyberGems/CyberViewer/releases',
  website: 'https://cybergems.org',
  donate: 'https://github.com/CyberGems/CyberViewer#%EF%B8%8F-donate'
});

function shouldShowTrayPinReminder(previousCloseToTray, nextCloseToTray, dismissed) {
  return !previousCloseToTray && !!nextCloseToTray && !dismissed;
}

function taskbarSettingsUri() {
  return 'ms-settings:taskbar';
}

function taskbarSettingsLaunch(platform, helperAvailable) {
  return {
    uri: taskbarSettingsUri(),
    method: platform === 'win32' && !!helperAvailable ? 'native' : 'uri'
  };
}

module.exports = {
  TRAY_HELP_URLS,
  shouldShowTrayPinReminder,
  taskbarSettingsUri,
  taskbarSettingsLaunch
};
