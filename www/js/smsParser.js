/**
 * People's Bank SMS Parser
 * Parses transaction SMS from People's Bank Sri Lanka into structured expense objects.
 * 
 * Sample formats:
 * "Dear Sir/Madam, Your A/C 046-2001****10 has been debited by Rs. 1525.00 (LPAY TFR @11:41 18/05/2026).[Av_Bal: Rs. 89996.98 at the time of SMS generated]"
 * "Dear Sir/Madam, Your A/C 046-2001****10 has been credited by Rs. 50000.00 (SALARY @09:00 01/05/2026).[Av_Bal: Rs. 120000.00 at the time of SMS generated]"
 */

const SmsParser = (() => {

  /**
   * Parse a single People's Bank SMS message
   * @param {string} smsBody - Raw SMS text
   * @param {number|string} smsDate - Timestamp from SMS metadata (optional)
   * @returns {object|null} Parsed expense object or null if not a valid transaction SMS
   */
  function parse(smsBody, smsDate = null) {
    if (!smsBody || typeof smsBody !== 'string') return null;

    const text = smsBody.trim();

    // Check if it's a People's Bank transaction SMS
    if (!isPeoplesBankSms(text)) return null;

    try {
      const account = extractAccount(text);
      const type = extractType(text);
      const amount = extractAmount(text);
      const description = extractDescription(text);
      const time = extractTime(text);
      const date = extractDate(text);
      const balance = extractBalance(text);

      if (amount === null) return null;

      // Build date-time
      let dateTime = null;
      if (date) {
        const [day, month, year] = date.split('/');
        dateTime = new Date(`${year}-${month}-${day}T${time || '00:00'}:00`);
      } else if (smsDate) {
        dateTime = new Date(typeof smsDate === 'number' ? smsDate : Date.parse(smsDate));
      } else {
        dateTime = new Date();
      }

      // Generate unique ID from content hash
      const id = generateId(text);

      return {
        id,
        rawSms: text,
        account: account || 'Unknown',
        type: type || 'debit',
        amount: amount,
        description: description || 'Unknown Transaction',
        date: dateTime.toISOString(),
        time: time || '',
        balance: balance,
        category: null, // Will be set by categorizer
        notes: '',
        createdAt: new Date().toISOString()
      };
    } catch (e) {
      console.error('Failed to parse SMS:', e, text);
      return null;
    }
  }

  /**
   * Parse multiple SMS messages
   */
  function parseMultiple(smsList) {
    return smsList
      .map(sms => parse(sms.body || sms, sms.date))
      .filter(expense => expense !== null);
  }

  /**
   * Parse manually pasted SMS text (may contain multiple messages)
   */
  function parseManualInput(text) {
    if (!text || typeof text !== 'string') return [];

    // Split by "Dear Sir/Madam" to handle multiple messages
    const messages = text.split(/(?=Dear\s+Sir\/Madam)/i).filter(m => m.trim());

    return messages
      .map(msg => parse(msg.trim()))
      .filter(expense => expense !== null);
  }

  /**
   * Check if SMS is from People's Bank
   */
  function isPeoplesBankSms(text) {
    const lower = text.toLowerCase();
    return (
      lower.includes('your a/c') &&
      lower.includes('rs.') &&
      (lower.includes('debited') || lower.includes('credited')) &&
      lower.includes('av_bal')
    );
  }

  /**
   * Extract account number: "A/C 046-2001****10"
   */
  function extractAccount(text) {
    const match = text.match(/A\/C\s+([\d\-\*]+)/i);
    return match ? match[1] : null;
  }

  /**
   * Extract transaction type: debited or credited
   */
  function extractType(text) {
    const lower = text.toLowerCase();
    if (lower.includes('debited')) return 'debit';
    if (lower.includes('credited')) return 'credit';
    return 'debit';
  }

  /**
   * Extract amount: "Rs. 1525.00" or "Rs. 1,525.00"
   */
  function extractAmount(text) {
    // Match the first Rs. amount (transaction amount, not balance)
    const match = text.match(/(?:debited|credited)\s+by\s+Rs\.\s*([\d,]+\.?\d*)/i);
    if (match) {
      return parseFloat(match[1].replace(/,/g, ''));
    }
    // Fallback: first Rs. amount
    const fallback = text.match(/Rs\.\s*([\d,]+\.?\d*)/i);
    return fallback ? parseFloat(fallback[1].replace(/,/g, '')) : null;
  }

  /**
   * Extract description from parentheses: "(LPAY TFR @11:41 18/05/2026)"
   */
  function extractDescription(text) {
    const match = text.match(/\(([^@)]+?)(?:\s*@)/);
    if (match) return match[1].trim();

    // Fallback: try to get text between parentheses
    const fallback = text.match(/\(([^)]+)\)/);
    if (fallback) {
      // Remove date and time parts
      let desc = fallback[1]
        .replace(/@\d{2}:\d{2}/, '')
        .replace(/\d{2}\/\d{2}\/\d{4}/, '')
        .trim();
      return desc || 'Transaction';
    }
    return 'Transaction';
  }

  /**
   * Extract time: "@11:41"
   */
  function extractTime(text) {
    const match = text.match(/@(\d{2}:\d{2})/);
    return match ? match[1] : null;
  }

  /**
   * Extract date: "18/05/2026"
   */
  function extractDate(text) {
    // Try DD/MM/YYYY
    let match = text.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (match) return match[1];

    // Try DD-MM-YYYY
    match = text.match(/(\d{2}-\d{2}-\d{4})/);
    if (match) return match[1].replace(/-/g, '/');

    return null;
  }

  /**
   * Extract available balance: "Av_Bal: Rs. 89996.98"
   */
  function extractBalance(text) {
    const match = text.match(/Av_Bal:\s*Rs\.\s*([\d,]+\.?\d*)/i);
    return match ? parseFloat(match[1].replace(/,/g, '')) : null;
  }

  /**
   * Generate unique ID from SMS content
   */
  function generateId(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return 'txn_' + Math.abs(hash).toString(36) + '_' + Date.now().toString(36);
  }

  return {
    parse,
    parseMultiple,
    parseManualInput,
    isPeoplesBankSms
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SmsParser;
}
