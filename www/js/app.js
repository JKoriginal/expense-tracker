/**
 * Main App Controller
 * Initializes and orchestrates all modules for the PB Expense Tracker.
 */

const App = (() => {
  let currentFilters = {};

  // ===== INITIALIZATION =====
  function init() {
    Store.init();
    const isNative = SmsReader.init();

    populateCategoryFilters();
    bindEvents();

    if (isNative) {
      showPermissionScreen();
    } else {
      showDashboard();
    }
  }

  // ===== SCREENS =====
  function showPermissionScreen() {
    document.getElementById('permissionScreen').classList.remove('hidden');
    document.getElementById('loadingScreen').classList.add('hidden');
    document.getElementById('dashboard').classList.add('hidden');
  }

  function showLoadingScreen(msg) {
    document.getElementById('permissionScreen').classList.add('hidden');
    document.getElementById('loadingScreen').classList.remove('hidden');
    document.getElementById('dashboard').classList.add('hidden');
    if (msg) document.getElementById('loadingStatus').textContent = msg;
  }

  function showDashboard() {
    document.getElementById('permissionScreen').classList.add('hidden');
    document.getElementById('loadingScreen').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    refreshDashboard();
  }

  // ===== SMS PERMISSION & READING =====
  async function handleGrantPermission() {
    const status = await SmsReader.requestPermission();
    if (status === 'granted') {
      await scanSms();
    } else if (status === 'unavailable') {
      showToast('SMS reading not available in browser. Use manual paste below.', 'info');
      showDashboard();
    } else {
      showToast('SMS permission denied. You can still paste SMS manually.', 'error');
      showDashboard();
    }
  }

  async function scanSms() {
    showLoadingScreen('Scanning your SMS inbox...');
    try {
      const bankSms = await SmsReader.readBankSms();
      showLoadingScreen(`Found ${bankSms.length} People's Bank messages. Processing...`);

      const expenses = SmsParser.parseMultiple(bankSms);
      expenses.forEach(exp => {
        exp.category = Categorizer.categorize(exp.description, exp.type);
      });

      const added = Store.addMultiple(expenses);
      showDashboard();
      showToast(`Imported ${added} new transactions (${expenses.length - added} duplicates skipped)`, 'success');
    } catch (e) {
      console.error('SMS scan failed:', e);
      showToast('Failed to read SMS. Use manual paste below.', 'error');
      showDashboard();
    }
  }

  // ===== MANUAL SMS PASTE =====
  function handleParseSms() {
    const input = document.getElementById('smsInput');
    const text = input.value.trim();
    const resultEl = document.getElementById('parseResult');

    if (!text) {
      resultEl.className = 'parse-result error';
      resultEl.textContent = 'Please paste an SMS message first';
      return;
    }

    const expenses = SmsParser.parseManualInput(text);
    if (expenses.length === 0) {
      resultEl.className = 'parse-result error';
      resultEl.textContent = '❌ Could not parse. Check the SMS format.';
      return;
    }

    expenses.forEach(exp => {
      exp.category = Categorizer.categorize(exp.description, exp.type);
    });

    const added = Store.addMultiple(expenses);
    if (added > 0) {
      resultEl.className = 'parse-result success';
      resultEl.textContent = `✅ Added ${added} transaction${added > 1 ? 's' : ''}`;
      input.value = '';
      refreshDashboard();
      showToast(`${added} transaction${added > 1 ? 's' : ''} added successfully!`, 'success');
    } else {
      resultEl.className = 'parse-result error';
      resultEl.textContent = '⚠️ Duplicate — already exists';
    }
  }

  // ===== DASHBOARD REFRESH =====
  function refreshDashboard() {
    const filters = getActiveFilters();
    const stats = Store.getStats(filters);
    const expenses = Store.getFiltered(filters);

    updateStatCards(stats);
    renderCharts(stats);
    renderTransactions(expenses);
  }

  function updateStatCards(stats) {
    document.getElementById('statExpense').textContent = formatCurrency(stats.totalDebit);
    document.getElementById('statIncome').textContent = formatCurrency(stats.totalCredit);

    const debitCount = Store.getFiltered({ ...getActiveFilters(), type: 'debit' }).length;
    const creditCount = Store.getFiltered({ ...getActiveFilters(), type: 'credit' }).length;
    document.getElementById('statExpenseCount').textContent = `${debitCount} transaction${debitCount !== 1 ? 's' : ''}`;
    document.getElementById('statIncomeCount').textContent = `${creditCount} transaction${creditCount !== 1 ? 's' : ''}`;

    if (stats.latestBalance !== null) {
      document.getElementById('statBalance').textContent = formatCurrency(stats.latestBalance);
      const allExp = Store.getAll();
      const latest = allExp.find(e => e.account);
      document.getElementById('statAccount').textContent = latest ? `A/C ${latest.account}` : '';
    } else {
      document.getElementById('statBalance').textContent = 'Rs. --';
      document.getElementById('statAccount').textContent = 'No data';
    }

    if (stats.topCategory) {
      const catInfo = Categorizer.getCategoryInfo(stats.topCategory.name);
      document.getElementById('statTopCat').textContent = `${catInfo.icon} ${stats.topCategory.name}`;
      document.getElementById('statTopCatAmount').textContent = formatCurrency(stats.topCategory.amount);
    } else {
      document.getElementById('statTopCat').textContent = '--';
      document.getElementById('statTopCatAmount').textContent = 'No data';
    }
  }

  function renderCharts(stats) {
    if (Object.keys(stats.categoryBreakdown).length > 0) {
      Charts.renderCategoryChart('categoryChart', stats.categoryBreakdown);
    }
    Charts.renderTrendChart('trendChart', stats.dailySpending);
    if (Object.keys(stats.monthlyData).length > 0) {
      Charts.renderMonthlyChart('monthlyChart', stats.monthlyData);
    }
  }

  function renderTransactions(expenses) {
    const container = document.getElementById('transactionsList');
    const countEl = document.getElementById('txCount');
    countEl.textContent = expenses.length;

    if (expenses.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <h4>No transactions found</h4>
          <p>Paste a People's Bank SMS above to get started</p>
        </div>`;
      return;
    }

    container.innerHTML = expenses.map(exp => {
      const catInfo = Categorizer.getCategoryInfo(exp.category || 'Other');
      const d = new Date(exp.date);
      const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      const timeStr = exp.time || d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const isDebit = exp.type === 'debit';

      return `
        <div class="tx-item" data-id="${exp.id}" onclick="App.openEditModal('${exp.id}')">
          <div class="tx-icon" style="background:${catInfo.color}20">${catInfo.icon}</div>
          <div class="tx-info">
            <div class="tx-desc">${escapeHtml(exp.description)}</div>
            <div class="tx-meta">
              <span>${dateStr}</span>
              <span>${timeStr}</span>
              ${exp.account ? `<span>A/C ${exp.account}</span>` : ''}
            </div>
          </div>
          <div class="tx-amount ${exp.type}">
            ${isDebit ? '-' : '+'}Rs. ${exp.amount.toLocaleString('en-US', {minimumFractionDigits:2})}
          </div>
          <div class="tx-category" style="background:${catInfo.color}18;color:${catInfo.color}">
            ${exp.category || 'Other'}
          </div>
          <button class="tx-delete" onclick="event.stopPropagation();App.deleteTransaction('${exp.id}')" title="Delete">🗑️</button>
        </div>`;
    }).join('');
  }

  // ===== FILTERS =====
  function getActiveFilters() {
    const period = document.getElementById('filterPeriod').value;
    const category = document.getElementById('filterCategory').value;
    const type = document.getElementById('filterType').value;
    const search = document.getElementById('searchInput').value;

    const filters = { category, type, search };
    const now = new Date();

    switch (period) {
      case 'today':
        filters.startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        break;
      case 'week':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        filters.startDate = weekStart.toISOString();
        break;
      case 'month':
        filters.startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        break;
      case '3months':
        filters.startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString();
        break;
      case 'year':
        filters.startDate = new Date(now.getFullYear(), 0, 1).toISOString();
        break;
      case 'custom':
        const sd = document.getElementById('filterStartDate').value;
        const ed = document.getElementById('filterEndDate').value;
        if (sd) filters.startDate = new Date(sd).toISOString();
        if (ed) filters.endDate = ed;
        break;
    }

    return filters;
  }

  function populateCategoryFilters() {
    const categories = Categorizer.getAllCategories();
    const filterSelect = document.getElementById('filterCategory');
    const editSelect = document.getElementById('editCategory');

    categories.forEach(cat => {
      const info = Categorizer.getCategoryInfo(cat);
      const opt1 = new Option(`${info.icon} ${cat}`, cat);
      filterSelect.add(opt1);
      if (editSelect) {
        const opt2 = new Option(`${info.icon} ${cat}`, cat);
        editSelect.add(opt2);
      }
    });
  }

  // ===== EDIT MODAL =====
  function openEditModal(id) {
    const expenses = Store.getAll();
    const exp = expenses.find(e => e.id === id);
    if (!exp) return;

    document.getElementById('editId').value = id;
    document.getElementById('editDescription').value = exp.description || '';
    document.getElementById('editAmount').value = exp.amount;
    document.getElementById('editCategory').value = exp.category || 'Other';
    document.getElementById('editType').value = exp.type;
    document.getElementById('editNotes').value = exp.notes || '';

    document.getElementById('editModal').classList.add('active');
  }

  function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
  }

  function saveEdit() {
    const id = document.getElementById('editId').value;
    const updates = {
      description: document.getElementById('editDescription').value,
      amount: parseFloat(document.getElementById('editAmount').value),
      category: document.getElementById('editCategory').value,
      type: document.getElementById('editType').value,
      notes: document.getElementById('editNotes').value
    };

    if (Store.updateExpense(id, updates)) {
      closeEditModal();
      refreshDashboard();
      showToast('Transaction updated', 'success');
    }
  }

  // ===== DELETE =====
  function deleteTransaction(id) {
    if (Store.deleteExpense(id)) {
      refreshDashboard();
      showToast('Transaction deleted', 'info');
    }
  }

  function clearAllData() {
    if (confirm('Are you sure you want to delete ALL transactions? This cannot be undone.')) {
      Store.clearAll();
      refreshDashboard();
      showToast('All data cleared', 'info');
    }
  }

  // ===== EXPORT =====
  function exportData() {
    const csv = Store.exportCSV(getActiveFilters());
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pb_expenses_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported to CSV', 'success');
  }

  // ===== TOAST =====
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100px)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // ===== HELPERS =====
  function formatCurrency(amount) {
    return `Rs. ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ===== EVENT BINDING =====
  function bindEvents() {
    document.getElementById('btnGrantPermission').addEventListener('click', handleGrantPermission);
    document.getElementById('btnParseSms').addEventListener('click', handleParseSms);
    document.getElementById('btnClearInput').addEventListener('click', () => {
      document.getElementById('smsInput').value = '';
      document.getElementById('parseResult').textContent = '';
    });
    document.getElementById('btnRefreshSms').addEventListener('click', async () => {
      if (SmsReader.isNative()) {
        await scanSms();
      } else {
        showToast('SMS scanning available only on Android app. Use paste below.', 'info');
      }
    });
    document.getElementById('btnExport').addEventListener('click', exportData);
    document.getElementById('btnClearAll').addEventListener('click', clearAllData);

    // Filters
    ['filterPeriod', 'filterCategory', 'filterType'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => {
        const customGroup = document.getElementById('customDateGroup');
        if (document.getElementById('filterPeriod').value === 'custom') {
          customGroup.classList.remove('hidden');
        } else {
          customGroup.classList.add('hidden');
        }
        refreshDashboard();
      });
    });
    document.getElementById('searchInput').addEventListener('input', debounce(refreshDashboard, 300));
    document.getElementById('filterStartDate').addEventListener('change', refreshDashboard);
    document.getElementById('filterEndDate').addEventListener('change', refreshDashboard);

    // Modal
    document.getElementById('btnCloseModal').addEventListener('click', closeEditModal);
    document.getElementById('btnCancelEdit').addEventListener('click', closeEditModal);
    document.getElementById('btnSaveEdit').addEventListener('click', saveEdit);
    document.getElementById('editModal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeEditModal();
    });

    // Keyboard shortcut
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeEditModal();
    });
  }

  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  return { init, openEditModal, deleteTransaction };
})();

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', App.init);
