/**
 * Auto-Categorizer
 * Categorizes People's Bank transactions based on description keywords.
 */

const Categorizer = (() => {

  const CATEGORIES = {
    'Online Transfer': {
      icon: '💸',
      color: '#a78bfa',
      keywords: ['lpay', 'trf', 'tfr', 'transfer', 'ft ', 'fund', 'ceft', 'slips', 'justpay', 'lankaqr']
    },
    'ATM Withdrawal': {
      icon: '🏧',
      color: '#fbbf24',
      keywords: ['atm', 'wdl', 'withdrawal', 'cash']
    },
    'POS / Shopping': {
      icon: '🛍️',
      color: '#f472b6',
      keywords: ['pos', 'purchase', 'card', 'shop', 'mall', 'daraz', 'amazon', 'store', 'fashion']
    },
    'Bills & Utilities': {
      icon: '💡',
      color: '#38bdf8',
      keywords: ['bill', 'utility', 'ceb', 'leco', 'nwsdb', 'water', 'electricity', 'dialog', 'mobitel', 'slt', 'hutch', 'airtel', 'insurance']
    },
    'Food & Dining': {
      icon: '🍔',
      color: '#fb923c',
      keywords: ['restaurant', 'cafe', 'pizza', 'burger', 'kfc', 'mcdonald', 'food', 'keells', 'cargills', 'arpico', 'spar', 'grocery']
    },
    'Transport': {
      icon: '🚗',
      color: '#4ade80',
      keywords: ['uber', 'pickme', 'fuel', 'petrol', 'ceypetco', 'ioc', 'lanka ioc', 'bus', 'train']
    },
    'Health': {
      icon: '💊',
      color: '#f87171',
      keywords: ['pharmacy', 'hospital', 'medical', 'doctor', 'channeling', 'lab', 'nawaloka', 'asiri', 'durdans', 'hemas']
    },
    'Education': {
      icon: '🎓',
      color: '#818cf8',
      keywords: ['school', 'university', 'college', 'course', 'tuition', 'exam', 'education']
    },
    'Salary / Income': {
      icon: '💰',
      color: '#34d399',
      keywords: ['salary', 'wage', 'income', 'bonus', 'dividend', 'interest', 'refund']
    },
    'Loan / EMI': {
      icon: '🏦',
      color: '#94a3b8',
      keywords: ['loan', 'emi', 'installment', 'mortgage', 'leasing']
    },
    'Other': {
      icon: '📦',
      color: '#64748b',
      keywords: []
    }
  };

  /**
   * Categorize a transaction by its description
   * @param {string} description - Transaction description (e.g., "LPAY TFR")
   * @param {string} type - Transaction type: "debit" or "credit"
   * @returns {string} Category name
   */
  function categorize(description, type = 'debit') {
    if (!description) return 'Other';

    // Credits are usually income/salary
    if (type === 'credit') {
      const descLower = description.toLowerCase();
      for (const [category, data] of Object.entries(CATEGORIES)) {
        if (data.keywords.some(kw => descLower.includes(kw))) {
          return category;
        }
      }
      return 'Salary / Income';
    }

    const descLower = description.toLowerCase();

    for (const [category, data] of Object.entries(CATEGORIES)) {
      if (category === 'Other') continue;
      if (data.keywords.some(kw => descLower.includes(kw))) {
        return category;
      }
    }

    return 'Other';
  }

  /**
   * Get category info (icon, color)
   */
  function getCategoryInfo(categoryName) {
    return CATEGORIES[categoryName] || CATEGORIES['Other'];
  }

  /**
   * Get all category names
   */
  function getAllCategories() {
    return Object.keys(CATEGORIES);
  }

  /**
   * Get all categories with their info
   */
  function getAllCategoriesInfo() {
    return { ...CATEGORIES };
  }

  return {
    categorize,
    getCategoryInfo,
    getAllCategories,
    getAllCategoriesInfo
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Categorizer;
}
