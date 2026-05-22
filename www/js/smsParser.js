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
    
    // Check for currency indicator (Rs. or LKR)
    const hasCurrency = lower.includes('rs.') || lower.includes('lkr');
    
    // Check for standard transaction keywords or card payment keywords
    const isDebitOrCredit = lower.includes('debited') || lower.includes('credited');
    const isCardPayment = lower.includes('card payment') || lower.includes('card transaction') || lower.includes('payment successful') || lower.includes('purchase successful');
    
    return hasCurrency && (isDebitOrCredit || isCardPayment);
  }

  /**
   * Legacy alias kept for backward compatibility
   */
  function isPeoplesBankSms(text) {
    return isTransactionSms(text);
  }

  /**
   * Extract account number: "A/C 046-2001****10" or "Card ending 1234"
   */
  function extractAccount(text) {
    // Matches "A/C 123", "A/C No. 123", "A/C No 123", "A/C: 123", "A/C-123", "A/C123"
    const match = text.match(/A\/C(?:\s*No\.?|\s*No|\s*:\s*|\s*-\s*|\s+)?\s*([\d\-\*]+)/i);
    if (match) return match[1];

    const cardMatch = text.match(/card\s+(?:ending|no\.)?\s*([\d\-\*]+)/i);
    return cardMatch ? `Card ${cardMatch[1]}` : null;
  }

  /**
   * Extract transaction type: debited or credited
   */
  function extractType(text) {
    const lower = text.toLowerCase();
    if (lower.includes('credited') || lower.includes('refund')) return 'credit';
    return 'debit';
  }

  /**
   * Extract amount: "Rs. 1525.00", "LKR 1,500.00" etc.
   */
  function extractAmount(text) {
    // Primary: match amount right after debited/credited (with optional "by" and optional currency "Rs./LKR")
    let match = text.match(/(?:debited|credited)\s+(?:by\s+)?(?:Rs\.?|LKR)?\s*([0-9][0-9,]*\.?\d*)/i);
    if (match) {
      return parseFloat(match[1].replace(/,/g, ''));
    }

    // Secondary: match LKR or Rs. right after transaction words
    match = text.match(/(?:successful|success|payment|charged|spent)\s*,?\s*(?:LKR|Rs\.?)\s*([0-9][0-9,]*\.?\d*)/i);
    if (match) {
      return parseFloat(match[1].replace(/,/g, ''));
    }

    // Fallback: match any LKR or Rs. before the balance keyword
    const parts = text.split(/(?:Av_Bal|Av\.?\s*Bal|Available\s+Balance|Available\s+Bal|Avail\.?\s*Bal|Avl\.?\s*Bal|Bal(?:ance)?)/i);
    const firstPart = parts[0];
    const amountMatch = firstPart.match(/(?:LKR|Rs\.?)\s*([0-9][0-9,]*\.?\d*)/i);
    if (amountMatch) {
      return parseFloat(amountMatch[1].replace(/,/g, ''));
    }

    return null;
  }

  /**
   * Extract description from parentheses, or "at [Merchant]" for card payments
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
      if (desc) return desc;
    }

    // Card payment merchant pattern (e.g. "... at KEG PORT on ...")
    const atMatch = text.match(/at\s+([^,.]+?)(?:\s+on|\d{2}\/\d{2}|\.|\s+Avl)/i);
    if (atMatch) {
      return atMatch[1].trim();
    }

    if (text.toLowerCase().includes('card payment')) {
      return 'Card Payment';
    }

    return 'Transaction';
  }

  /**
   * Extract time: "@11:41" or "11:41"
   */
  function extractTime(text) {
    const match = text.match(/(?:@|\s|^)(\d{2}:\d{2})/);
    return match ? match[1] : null;
  }

  /**
   * Extract date: "18/05/2026" or "18/05/26"
   */
  function extractDate(text) {
    // Try DD/MM/YYYY or DD/MM/YY
    let match = text.match(/(\d{2})\/(\d{2})\/(\d{4}|\d{2})/);
    if (match) {
      let year = match[3];
      if (year.length === 2) year = '20' + year;
      return `${match[1]}/${match[2]}/${year}`;
    }

    // Try DD-MM-YYYY or DD-MM-YY
    match = text.match(/(\d{2})-(\d{2})-(\d{4}|\d{2})/);
    if (match) {
      let year = match[3];
      if (year.length === 2) year = '20' + year;
      return `${match[1]}/${match[2]}/${year}`;
    }

    return null;
  }

  /**
   * Extract available balance: "Av_Bal: Rs. 89996.98" or "Avl.Bal: LKR 89,996.98"
   */
  function extractBalance(text) {
    const patterns = [
      /Av_Bal[:\s\.]+(?:Rs\.?|LKR)?\s*([0-9][0-9,]*\.?\d*)/i,
      /Av\.?\s*Bal[:\s\.]+(?:Rs\.?|LKR)?\s*([0-9][0-9,]*\.?\d*)/i,
      /Available\s+Balance[:\s\.]+(?:Rs\.?|LKR)?\s*([0-9][0-9,]*\.?\d*)/i,
      /Available\s+Bal[:\s\.]+(?:Rs\.?|LKR)?\s*([0-9][0-9,]*\.?\d*)/i,
      /Avail\.?\s*Bal[:\s\.]+(?:Rs\.?|LKR)?\s*([0-9][0-9,]*\.?\d*)/i,
      /Avl\.?\s*Bal[:\s\.]+(?:Rs\.?|LKR)?\s*([0-9][0-9,]*\.?\d*)/i,
      /Bal(?:ance)?[:\s\.]+(?:Rs\.?|LKR)?\s*([0-9][0-9,]*\.?\d*)/i
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
