'use strict';

const TRAY_HELP_URLS = Object.freeze({
  docs: 'https://github.com/CyberGems/CyberViewer/wiki',
  faq: 'https://github.com/CyberGems/CyberViewer/wiki/FAQ',
  changelog: 'https://github.com/CyberGems/CyberViewer/releases',
  website: 'https://cybergems.org',
  donate: 'https://github.com/CyberGems/CyberViewer#%EF%B8%8F-donate'
});

function buildTrayHelpModel(translations) {
  const t = translations || {};
  return {
    label: t.tray_help,
    backLabel: t.tray_help_back,
    pinLabel: t.tray_help_pin,
    docsLabel: t.tray_help_docs,
    faqLabel: t.tray_help_faq,
    changelogLabel: t.tray_help_changelog,
    websiteLabel: t.tray_help_website,
    donateLabel: t.tray_help_donate,
    aboutLabel: t.tray_about || t.about,
    updatesLabel: t.tray_help_updates,
    actions: [
      'help-pin',
      'help-docs',
      'help-faq',
      'help-changelog',
      'help-website',
      'help-donate',
      'help-about',
      'help-check-updates'
    ]
  };
}

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
  buildTrayHelpModel,
  shouldShowTrayPinReminder,
  taskbarSettingsUri,
  taskbarSettingsLaunch
};
