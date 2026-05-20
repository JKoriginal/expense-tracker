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

    // Check if it's a valid transaction SMS (debit/credit with amount)
    if (!isTransactionSms(text)) return null;

    try {
      const account = extractAccount(text);
      const type = extractType(text);
      const amount = extractAmount(text);
      const description = extractDescription(text);
      const time = extractTime(text);
      const date = extractDate(text);
      const balance = extractBalance(text);

      if (amount === null || amount <= 0) return null;

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

      // Validate the date is sensible
      if (isNaN(dateTime.getTime())) {
        dateTime = smsDate ? new Date(smsDate) : new Date();
      }

      // Generate deterministic unique ID from SMS content (not time-based)
      const id = generateId(account, type, amount, date || '', time || '', description);

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
   * Parse multiple SMS messages (from native reader)
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
   * Check if SMS is a valid transaction message (debit or credit with an amount).
   * This is less strict than before — we trust the address filter in SmsReader
   * to ensure we only get PeoplesBank messages.
   */
  function isTransactionSms(text) {
    const lower = text.toLowerCase();
    return (
      lower.includes('your a/c') &&
      lower.includes('rs.') &&
      (lower.includes('debited') || lower.includes('credited'))
    );
  }

  /**
   * Legacy alias kept for backward compatibility
   */
  function isPeoplesBankSms(text) {
    return isTransactionSms(text);
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
   * Specifically matches the amount after "debited by" or "credited by" to avoid
   * picking up the balance amount instead.
   */
  function extractAmount(text) {
    // Primary: match amount right after "debited by Rs." or "credited by Rs."
    const match = text.match(/(?:debited|credited)\s+by\s+Rs\.?\s*([0-9][0-9,]*\.?\d*)/i);
    if (match) {
      return parseFloat(match[1].replace(/,/g, ''));
    }
    return null;
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
   * Extract available balance: "Av_Bal: Rs. 89996.98" or "Av.Bal: Rs. 89996.98"
   * Handles various balance label formats from PeoplesBank SMS
   */
  function extractBalance(text) {
    // Try multiple known balance label patterns
    const patterns = [
      /Av_Bal[:\s]+Rs\.?\s*([0-9][0-9,]*\.?\d*)/i,
      /Av\.?\s*Bal[:\s]+Rs\.?\s*([0-9][0-9,]*\.?\d*)/i,
      /Available\s+Balance[:\s]+Rs\.?\s*([0-9][0-9,]*\.?\d*)/i,
      /Avl\.?\s*Bal[:\s]+Rs\.?\s*([0-9][0-9,]*\.?\d*)/i
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return parseFloat(match[1].replace(/,/g, ''));
    }
    return null;
  }

  /**
   * Generate a deterministic unique ID from transaction details.
   * This ensures the same SMS always produces the same ID,
   * preventing duplicates when re-scanning.
   */
  function generateId(account, type, amount, date, time, description) {
    const raw = `${account}|${type}|${amount}|${date}|${time}|${description}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const char = raw.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return 'txn_' + Math.abs(hash).toString(36);
  }

  return {
    parse,
    parseMultiple,
    parseManualInput,
    isPeoplesBankSms,
    isTransactionSms
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SmsParser;
}
