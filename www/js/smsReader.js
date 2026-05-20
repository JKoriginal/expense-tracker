/**
 * SMS Reader Module
 * Handles SMS permission requests and inbox reading via Capacitor plugin.
 * Falls back to manual input when running in browser (non-native).
 */

const SmsReader = (() => {
  let _isNative = false;
  let _smsPlugin = null;

  /**
   * Initialize the SMS reader - detect if running in Capacitor native context
   */
  function init() {
    try {
      if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        _isNative = true;
        _smsPlugin = window.Capacitor.Plugins.SMSInboxReader;
      }
    } catch (e) {
      _isNative = false;
    }
    return _isNative;
  }

  /**
   * Check if SMS permission has been granted
   */
  async function checkPermission() {
    if (!_isNative || !_smsPlugin) return 'unavailable';
    try {
      const result = await _smsPlugin.checkPermissions();
      return result.sms || 'denied';
    } catch (e) {
      console.error('Permission check failed:', e);
      return 'denied';
    }
  }

  /**
   * Request SMS read permission from user
   */
  async function requestPermission() {
    if (!_isNative || !_smsPlugin) return 'unavailable';
    try {
      const result = await _smsPlugin.requestPermissions();
      return result.sms || 'denied';
    } catch (e) {
      console.error('Permission request failed:', e);
      return 'denied';
    }
  }

  /**
   * Read all SMS messages from inbox
   * Returns array of { address, body, date, type }
   */
  async function readAllSms() {
    if (!_isNative || !_smsPlugin) return [];
    try {
      const result = await _smsPlugin.getSMSList({
        filter: {
          maxCount: 5000
        }
      });
      return result.smsList || [];
    } catch (e) {
      console.error('Failed to read SMS:', e);
      return [];
    }
  }

  /**
   * Read and filter only People's Bank SMS messages
   * Filters by address 'PeoplesBank' and transaction keywords
   */
  async function readBankSms() {
    const allSms = await readAllSms();
    return allSms.filter(sms => {
      if (sms.address !== 'PeoplesBank') {
        return false;
      }
      const body = (sms.body || '').toLowerCase();
      return (
        body.includes('your a/c') &&
        body.includes('rs.') &&
        (body.includes('debited') || body.includes('credited'))
      );
    });
  }

  /**
   * Check if running in native (Capacitor) environment
   */
  function isNative() {
    return _isNative;
  }

  return {
    init,
    isNative,
    checkPermission,
    requestPermission,
    readAllSms,
    readBankSms
  };
})();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SmsReader;
}
