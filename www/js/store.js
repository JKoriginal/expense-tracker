/**
 * Data Store - Manages expense data persistence using localStorage.
 */
const Store = (() => {
  const STORAGE_KEY = 'pb_expenses';
  let _expenses = [];

  function init() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) { try { _expenses = JSON.parse(saved); } catch(e) { _expenses = []; } }
    return _expenses;
  }

  function _save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(_expenses)); }

  function addExpense(expense) {
    const isDuplicate = _expenses.some(e =>
      e.id === expense.id ||
      (e.amount === expense.amount && e.date === expense.date &&
       e.description === expense.description && e.type === expense.type)
    );
    if (isDuplicate) return false;
    _expenses.unshift(expense);
    _save();
    return true;
  }

  function addMultiple(expenses) {
    let added = 0;
    expenses.forEach(exp => { if (addExpense(exp)) added++; });
    return added;
  }

  function getAll() { return [..._expenses]; }

  function getLocalDateString(dateInput) {
    if (!dateInput) return '';
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      return dateInput;
    }
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getFiltered({ startDate, endDate, category, type, search } = {}) {
    let result = [..._expenses];
    const startStr = startDate ? getLocalDateString(startDate) : null;
    const endStr = endDate ? getLocalDateString(endDate) : null;

    if (startStr) {
      result = result.filter(e => getLocalDateString(e.date) >= startStr);
    }
    if (endStr) {
      result = result.filter(e => getLocalDateString(e.date) <= endStr);
    }
    if (category && category !== 'All') result = result.filter(e => e.category === category);
    if (type && type !== 'All') result = result.filter(e => e.type === type);
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(e =>
        (e.description||'').toLowerCase().includes(s) ||
        (e.category||'').toLowerCase().includes(s) ||
        (e.rawSms||'').toLowerCase().includes(s)
      );
    }
    return result;
  }

  function updateExpense(id, updates) {
    const i = _expenses.findIndex(e => e.id === id);
    if (i === -1) return false;
    _expenses[i] = { ..._expenses[i], ...updates };
    _save();
    return true;
  }

  function deleteExpense(id) {
    const i = _expenses.findIndex(e => e.id === id);
    if (i === -1) return false;
    _expenses.splice(i, 1);
    _save();
    return true;
  }

  function getStats(filters = {}) {
    const expenses = getFiltered(filters);
    const totalDebit = expenses.filter(e => e.type === 'debit').reduce((s, e) => s + e.amount, 0);
    const totalCredit = expenses.filter(e => e.type === 'credit').reduce((s, e) => s + e.amount, 0);

    const categoryBreakdown = {};
    expenses.filter(e => e.type === 'debit').forEach(e => {
      const cat = e.category || 'Other';
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + e.amount;
    });

    const dailySpending = {};
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      dailySpending[getLocalDateString(d)] = 0;
    }
    expenses.filter(e => e.type === 'debit').forEach(e => {
      const key = getLocalDateString(e.date);
      if (dailySpending.hasOwnProperty(key)) dailySpending[key] += e.amount;
    });

    const monthlyData = {};
    expenses.forEach(e => {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if (!monthlyData[key]) monthlyData[key] = { debit: 0, credit: 0 };
      monthlyData[key][e.type] += e.amount;
    });

    // Current balance: always use the most recent transaction by date from ALL data
    // (not filtered), since the balance represents the latest account state
    const allSorted = [..._expenses]
      .filter(e => e.balance != null)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    const latestWithBal = allSorted.length > 0 ? allSorted[0] : null;

    const topCat = Object.entries(categoryBreakdown).sort((a,b) => b[1]-a[1])[0];

    return {
      totalDebit, totalCredit, netBalance: totalCredit - totalDebit,
      latestBalance: latestWithBal ? latestWithBal.balance : null,
      transactionCount: expenses.length,
      categoryBreakdown, dailySpending, monthlyData,
      topCategory: topCat ? { name: topCat[0], amount: topCat[1] } : null
    };
  }

  function exportCSV(filters = {}) {
    const expenses = getFiltered(filters);
    const h = 'Date,Time,Type,Amount,Description,Category,Account,Balance';
    const rows = expenses.map(e => {
      const d = new Date(e.date);
      return [d.toLocaleDateString('en-GB'), e.time||'', e.type==='debit'?'Debit':'Credit',
        e.amount.toFixed(2), e.description, e.category||'', e.account||'',
        e.balance!=null?e.balance.toFixed(2):''].join(',');
    });
    return [h, ...rows].join('\n');
  }

  function exportJSON() { return JSON.stringify(_expenses, null, 2); }
  function importJSON(json) {
    try { const d = JSON.parse(json); return Array.isArray(d) ? addMultiple(d) : 0; }
    catch(e) { return 0; }
  }
  function clearAll() { _expenses = []; _save(); }
  function getCount() { return _expenses.length; }

  return { init, addExpense, addMultiple, getAll, getFiltered, updateExpense,
    deleteExpense, getStats, getCount, exportCSV, exportJSON, importJSON, clearAll };
})();
