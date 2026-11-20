const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  TRAY_TOOLTIP_MAX_LENGTH,
  formatTrayTooltip
} = require('../lib/tray-tooltip');

describe('tray tooltip format', () => {
  it('uses the suite format with a single shortcut segment', () => {
    assert.equal(formatTrayTooltip('Alt+Shift+V'), 'CyberViewer · Alt+Shift+V');
  });

  it('falls back to the bare app name without a shortcut', () => {
    assert.equal(formatTrayTooltip(undefined), 'CyberViewer');
    assert.equal(formatTrayTooltip(''), 'CyberViewer');
    assert.equal(formatTrayTooltip('   '), 'CyberViewer');
    assert.equal(formatTrayTooltip(null), 'CyberViewer');
  });

  it('trims the segment before formatting', () => {
    assert.equal(formatTrayTooltip('  Alt+Shift+V  '), 'CyberViewer · Alt+Shift+V');
  });

  it('caps the tooltip at 63 characters with an ellipsis', () => {
    const tooltip = formatTrayTooltip('X'.repeat(80));
    assert.equal(tooltip.length, TRAY_TOOLTIP_MAX_LENGTH);
    assert.ok(tooltip.endsWith('…'));
    assert.ok(tooltip.startsWith('CyberViewer · '));
  });
});
