// public/js/transaction.js
import { auth, db } from "./firebase-config.js";
import {
  collection, addDoc, getDocs, query, where, getDoc, deleteDoc, doc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { formatRupiah } from "./utils.js";

// --- DOM Elements (untuk halaman transaction.html) ---
const transactionListContainer = document.getElementById("latest-transaction-list");
const summaryIncomeText = document.getElementById("summary-income");
const summaryOutcomeText = document.getElementById("summary-outcome");
const netIncomeText = document.getElementById("net-income");
const netIncomeChartEl = document.getElementById("netIncomeChart");
const logoutBtnSidebar = document.getElementById("logoutBtnSidebar");
const downloadReportBtn = document.getElementById("downloadReportBtn");

// Filter elements
const filterAccountSelect = document.getElementById("filter-account"); // CHANGED: from filter-all to filter-account
const filterDateFromInput = document.getElementById("filter-date-from");
const filterDateToInput = document.getElementById("filter-date-to");
const applyDateFilterBtn = document.getElementById("apply-date-filter-btn");
const clearFilterBtn = document.getElementById("clear-filter-btn");

// --- DOM Elements (untuk modal Add Transaction, sama seperti expense.js) ---
const expenseForm = document.getElementById("expenseForm");
const typeSelect = document.getElementById("type");
const bankAccountSelect = document.getElementById("bankAccountSelect");
const amountInput = document.getElementById("amount");
const categorySelect = document.getElementById("category");
const dateInput = document.getElementById("date");
const timeInput = document.getElementById("time");
const descInput = document.getElementById("desc");
const addTransactionBtn = document.getElementById("addTransactionBtn");
const transactionModalElement = document.getElementById('transactionModal');
const transactionModal = new bootstrap.Modal(transactionModalElement);

// --- Categories (Sama seperti expense.js) ---
const incomeCategories = [
  "Salary", "Freelance", "Bonus", "Gift", "Investment", "Business", "Rental Income", "Dividends", "Cashback", "Other"
];
const expenseCategories = [
  "Food & Drinks", "Groceries", "Transport", "Fuel", "Parking", "Bills & Utilities", "Electricity", "Internet",
  "Mobile Plan", "Shopping", "Entertainment", "Health & Medical", "Insurance", "Education", "Subscriptions",
  "Travel", "Dining Out", "Donations", "Gifts", "Personal Care", "Household", "Pets", "Loan Payments", "Taxes", "Other"
];

// Akun Management Section Elements (Perlu ditambahkan di transaction.js juga jika button 'Lihat Akun' atau 'Back to Home' ada di sini atau terkait)
// Jika tidak ada di transaction.html, Anda bisa hapus ini:
const expenseTrackerSection = document.getElementById("expense-tracker-section"); // Asumsi ini ada di expense.html, tapi jika diperlukan untuk alur ini di transaction.js juga.
const accountManagementSection = document.getElementById("account-management-section"); // Asumsi ini ada di expense.html, tapi jika diperlukan untuk alur ini di transaction.js juga.
// Jika tidak ada di transaction.html, Anda bisa hapus ini:
const renderAccountList = async (userId) => {
  console.warn("renderAccountList function is a placeholder in transaction.js. This functionality is primarily in expense.js.");
  // Implementasi dummy atau biarkan kosong jika Anda yakin halaman transaction.html tidak pernah menampilkan daftar akun.
  // Jika Anda ingin menampilkan pesan "Anda perlu menambahkan akun" di halaman ini juga, logikanya perlu disesuaikan.
};

let currentUserId = null;
let userAccounts = []; // Store user's accounts

// --- Helpers ---
function updateCategoryOptions(type, selectEl) {
  const targetSelect = selectEl || categorySelect;
  targetSelect.innerHTML = ""; // Clear existing options
  const categories = type === "income" ? incomeCategories : expenseCategories;
  categories.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    targetSelect.appendChild(opt);
  });
}

// Helper to populate account dropdowns (used for add transaction modal and filter)
function updateBankAccountOptions(selectEl, accounts) {
  selectEl.innerHTML = '<option value="all">Semua Akun</option>'; // Default "Semua Akun" option
  if (accounts.length === 0) {
      const noAccountOpt = document.createElement("option");
      noAccountOpt.value = "";
      noAccountOpt.textContent = "Tidak ada akun tersedia";
      noAccountOpt.disabled = true;
      noAccountOpt.selected = true;
      selectEl.appendChild(noAccountOpt);
      return;
  }
  accounts.forEach(account => {
    const opt = document.createElement("option");
    opt.value = account.id;
    opt.textContent = `${account.name} (${account.accountNumber})`;
    selectEl.appendChild(opt);
  });
}

// --- Penangan UI Modal (Sama seperti expense.js) ---
typeSelect.addEventListener("change", () => updateCategoryOptions(typeSelect.value));
amountInput.addEventListener("input", (e) => {
  const value = e.target.value.replace(/[^0-9]/g, "");
  amountInput.value = value ? formatRupiah(value) : "";
});

// MODIFIKASI UTAMA DI SINI untuk Add Transaction Button di Transaction Page
addTransactionBtn.addEventListener('click', async () => {
  expenseForm.reset();
  typeSelect.value = "income";
  updateCategoryOptions(typeSelect.value);
  await fetchUserAccounts(currentUserId); // Ensure userAccounts is up-to-date

  if (userAccounts.length === 0) {
    // Jika tidak ada akun, alihkan pengguna ke halaman Home/Expense, lalu ke halaman manajemen akun di sana
    alert("Anda perlu menambahkan setidaknya satu akun bank terlebih dahulu!");
    // Kita tidak bisa langsung memunculkan accountManagementSection di transaction.html
    // karena elemen HTML untuk itu mungkin tidak ada atau alurnya berbeda.
    // Opsi terbaik adalah mengarahkan kembali ke expense.html
    window.location.href = "expense.html"; 
    return; 
  }

  // Jika ada akun, lanjutkan untuk menampilkan modal transaksi
  bankAccountSelect.value = userAccounts[0].id; // Pilih akun pertama secara default
  transactionModal.show();
});

transactionModalElement.addEventListener('shown.bs.modal', async () => {
  updateCategoryOptions(typeSelect.value);
  // Re-populate bank account options in case new account was added while modal was closed
  await fetchUserAccounts(currentUserId);
  if (userAccounts.length > 0) {
    bankAccountSelect.value = userAccounts[0].id; // Select first account by default
  } else {
    bankAccountSelect.value = ""; // Ensure "Pilih Akun Bank" is displayed if no accounts
  }
});

// --- Auth dan Fetch Data Halaman Transaksi ---
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("Berhasil keluar.");
    window.location.href = "login.html";
    return;
  }
  currentUserId = user.uid;
  
  const userDocRef = doc(db, "users", currentUserId);
  const userDocSnap = await getDoc(userDocRef);
  if (userDocSnap.exists() && userDocSnap.data().name) {
    // document.getElementById("user-name").textContent = userDocSnap.data().name; // Uncomment if user-name exists on this page
  }

  // Initial fetch accounts for the transaction modal AND for the new filter
  await fetchUserAccounts(currentUserId);
  // Set default selection for the filter dropdown
  if (userAccounts.length > 0) {
      filterAccountSelect.value = "all"; // Default to 'Semua Akun'
  }

  await fetchTransactions(currentUserId);

  // Event Listeners for main page filters
  filterAccountSelect.addEventListener("change", () => {
    fetchTransactions(currentUserId);
  });

  // Date range filter event listener
  applyDateFilterBtn.addEventListener("click", () => {
    const startDateStr = filterDateFromInput.value;
    const endDateStr = filterDateToInput.value;

    console.log("From (string):", startDateStr, "To (string):", endDateStr); // Debugging

    // Client-side validation for date range
    if (startDateStr && endDateStr) {
      const [startY, startM, startD] = startDateStr.split('-').map(Number);
      const [endY, endM, endD] = endDateStr.split('-').map(Number);

      const startDate = new Date(startY, startM - 1, startD);
      const endDate = new Date(endY, endM - 1, endD);

      console.log("Parsed From Date (Object):", startDate, "Parsed To Date (Object):", endDate); // Debugging
      console.log("Is From Date > To Date?", startDate > endDate); // Debugging

      if (startDate > endDate) {
        alert("Tanggal 'From' tidak boleh setelah tanggal 'To'.");
        return;
      }
    } else if (startDateStr && !endDateStr) {
        alert("Mohon masukkan tanggal 'To' untuk rentang filter.");
        return;
    } else if (!startDateStr && endDateStr) {
        alert("Mohon masukkan tanggal 'From' untuk rentang filter.");
        return;
    }

    fetchTransactions(currentUserId);
  });

  // Clear filter button event listener
  clearFilterBtn.addEventListener("click", () => {
    filterAccountSelect.value = "all";
    filterDateFromInput.value = "";
    filterDateToInput.value = "";
    fetchTransactions(currentUserId);
  });

  // Listener untuk form submit di modal (fungsi tambah transaksi)
  expenseForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const amount = parseInt(amountInput.value.replace(/[^0-9]/g, ""));
    const description = descInput.value.trim();
    const category = categorySelect.value;
    const date = dateInput.value;
    const time = timeInput.value;
    const type = typeSelect.value;
    const selectedAccountId = bankAccountSelect.value; // Get selected account ID

    if (!amount || isNaN(amount) || amount <= 0) return alert("Jumlah tidak valid.");
    if (description.length < 3) return alert("Deskripsi terlalu pendek (minimal 3 karakter).");
    if (!selectedAccountId) return alert("Pilih akun bank."); // Validate account selection

    try {
      await addDoc(collection(db, "entries"), {
        userId: currentUserId,
        accountId: selectedAccountId, // Associate with selected account
        amount, description, category, date, time, type,
        createdAt: new Date()
      });
      expenseForm.reset();
      typeSelect.value = "income";
      updateCategoryOptions(typeSelect.value);
      await fetchTransactions(currentUserId); // Re-fetch to update the list and chart
      transactionModal.hide();
    } catch (err) {
      console.error("Gagal menambahkan entri:", err);
      alert("Gagal menambahkan entri. Silakan coba lagi.");
    }
  });

  // Listener tombol logout
  logoutBtnSidebar?.addEventListener("click", async () => {
    const confirmLogout = confirm("Apakah Anda yakin ingin keluar?");
    if (!confirmLogout) return;
    
    try {
      await signOut(auth);
      localStorage.clear();
      window.location.href = "login.html";
    } catch (err) {
      console.error("Kesalahan logout:", err);
      alert("Gagal logout.");
    }
  });
});

// --- Fetch User Accounts ---
async function fetchUserAccounts(userId) {
    userAccounts = [];
    const qAccounts = query(collection(db, "accounts"), where("userId", "==", userId));
    const accountsSnapshot = await getDocs(qAccounts);
    accountsSnapshot.forEach(docSnap => {
        userAccounts.push({ id: docSnap.id, ...docSnap.data() });
    });
    // This call is specifically for the transaction modal
    updateBankAccountOptions(bankAccountSelect, userAccounts);
    // This call is specifically for the main filter dropdown
    updateBankAccountOptions(filterAccountSelect, userAccounts); // Populate the filter dropdown as well
}


// --- Fungsi untuk Mengambil dan Menampilkan Transaksi ---
async function fetchTransactions(userId) {
  let q = query(collection(db, "entries"), where("userId", "==", userId));

  const startDate = filterDateFromInput.value;
  const endDate = filterDateToInput.value;
  const selectedAccountIdFilter = filterAccountSelect.value; // Get selected account from filter

  if (startDate) {
    q = query(q, where("date", ">=", startDate));
  }
  if (endDate) {
    q = query(q, where("date", "<=", endDate));
  }
  
  // NEW: Apply account filter
  if (selectedAccountIdFilter !== "all") {
    q = query(q, where("accountId", "==", selectedAccountIdFilter));
  }

  console.log("Constructed Firestore Query:", q); // Debugging: Log the constructed query

  const snapshot = await getDocs(q);

  console.log("Firestore Snapshot is empty:", snapshot.empty); // Debugging: Check if snapshot is empty

  let totalIncome = 0;
  let totalExpense = 0;
  const groupedTransactions = {};
  const allEntriesForChart = []; // These are the entries AFTER applying filters

  snapshot.forEach((docSnap) => {
    const item = { id: docSnap.id, ...docSnap.data() };
    allEntriesForChart.push(item); // Add to chart data only if it passes filters

    const date = item.date;

    if (!groupedTransactions[date]) {
      groupedTransactions[date] = [];
    }
    groupedTransactions[date].push(item);

    if (item.type === "income") {
      totalIncome += item.amount;
    } else {
      totalExpense += item.amount;
    }
  });

  console.log("Number of entries for chart:", allEntriesForChart.length); // Debugging: Check how many entries found

  if (summaryIncomeText) summaryIncomeText.textContent = formatRupiah(totalIncome);
  if (summaryOutcomeText) summaryOutcomeText.textContent = formatRupiah(totalExpense);
  
  const netIncome = totalIncome - totalExpense;
  if (netIncomeText) netIncomeText.textContent = formatRupiah(netIncome);

  // Show/hide clear filter button based on account filter too
  if (filterAccountSelect.value !== "all" || filterDateFromInput.value !== "" || filterDateToInput.value !== "") {
    clearFilterBtn.style.display = 'block';
  } else {
    clearFilterBtn.style.display = 'none';
  }

  transactionListContainer.innerHTML = "";
  const sortedDates = Object.keys(groupedTransactions).sort((a, b) => b.localeCompare(a));

  sortedDates.forEach(date => {
    const dateHeaderDiv = document.createElement("div");
    dateHeaderDiv.className = "transaction-group mb-3";
    
    const dateHeaderH6 = document.createElement("h6");
    dateHeaderH6.className = "text-muted mb-2";
    dateHeaderH6.textContent = date;
    dateHeaderDiv.appendChild(dateHeaderH6);

    groupedTransactions[date].forEach(item => {
      const transactionItemDiv = document.createElement("div");
      transactionItemDiv.className = `transaction-box d-flex align-items-center justify-content-between p-3 rounded mb-2`;

      const iconClass = item.type === "income" ? "bi bi-caret-down-fill" : "bi bi-caret-up-fill";
      const iconBgColor = item.type === "income" ? "text-success" : "text-danger";
      const amountTextColor = item.type === "income" ? "text-success" : "text-danger";
      const amountSign = item.type === "income" ? "+" : "-";

      transactionItemDiv.innerHTML = `
        <div class="d-flex align-items-center">
            <div class="transaction-icon d-flex justify-content-center align-items-center rounded-circle me-3" style="width:40px; height:40px; background-color: #f0f0f0;">
                <i class="bi ${iconClass} ${iconBgColor}" style="font-size:1.5em;"></i>
            </div>
            <div>
                <strong class="d-block">${item.description}</strong>
                <small class="text-muted">${item.category}</small>
                <div class="transaction-details d-none">
                  <div><strong>Tipe:</strong> ${item.type}</div>
                  <div><strong>Kategori:</strong> ${item.category}</div>
                  <div><strong>Deskripsi:</strong> ${item.description}</div>
                  <div><strong>Waktu:</strong> ${item.time}</div>
                  <div><strong>Akun:</strong> ${userAccounts.find(acc => acc.id === item.accountId)?.name || 'N/A'}</div>
                </div>
            </div>
        </div>
        <span class="${amountTextColor} fw-bold">${amountSign}${formatRupiah(item.amount)}</span>
      `;
      const actionButtonsHtml = `
        <div class="entry-action-buttons">
            <button class="btn btn-edit-icon"><i class="bi bi-pencil-square"></i></button>
            <button class="btn btn-delete-icon"><i class="bi bi-trash"></i></button>
        </div>
      `;
      transactionItemDiv.querySelector('.d-flex.justify-content-between.align-items-center').innerHTML += actionButtonsHtml;


      const detailSection = transactionItemDiv.querySelector(".transaction-details");
      transactionItemDiv.addEventListener("click", (e) => {
        if (!e.target.closest(".entry-action-buttons")) {
          detailSection.classList.toggle("d-none");
        }
      });

      transactionItemDiv.querySelector(".btn-delete-icon").onclick = async () => {
        await deleteDoc(doc(db, "entries", item.id));
        fetchTransactions(userId);
      };

      transactionItemDiv.querySelector(".btn-edit-icon").onclick = async () => {
        typeSelect.value = item.type;
        updateCategoryOptions(item.type);
        bankAccountSelect.value = item.accountId;
        categorySelect.value = item.category;
        amountInput.value = formatRupiah(item.amount);
        descInput.value = item.description;
        dateInput.value = item.date;
        timeInput.value = item.time;
        transactionModal.show();
        await deleteDoc(doc(db, "entries", item.id));
        fetchTransactions(userId);
      };
      dateHeaderDiv.appendChild(transactionItemDiv);
    });
    transactionListContainer.appendChild(dateHeaderDiv);
  });

  renderNetIncomeChart(allEntriesForChart);
}

// Fungsi untuk me-render chart
let netIncomeChartInstance = null;
function renderNetIncomeChart(allEntries) {
  if (!netIncomeChartEl) return;

  if (netIncomeChartInstance) {
    netIncomeChartInstance.destroy();
  }

  // Only proceed if there's data to render
  if (allEntries.length === 0) {
      console.log("No data for chart. Chart will not be rendered with bars.");
      netIncomeChartEl.style.display = 'none'; // Hide canvas if no data
      return;
  } else {
      netIncomeChartEl.style.display = 'block'; // Show canvas if there's data
  }


  const monthlyData = {};

  allEntries.forEach(item => {
    const yearMonth = item.date.substring(0, 7);
    if (!monthlyData[yearMonth]) {
      monthlyData[yearMonth] = { income: 0, expense: 0 };
    }
    if (item.type === "income") {
      monthlyData[yearMonth].income += item.amount;
    } else {
      monthlyData[yearMonth].expense += item.amount;
    }
  });

  const sortedMonths = Object.keys(monthlyData).sort();

  const labels = sortedMonths.map(month => {
    const [year, mon] = month.split('-');
    const date = new Date(year, parseInt(mon) - 1, 1);
    return date.toLocaleString('id-ID', { month: 'short', year: '2-digit' });
  });
  const incomeData = sortedMonths.map(month => monthlyData[month].income);
  const expenseData = sortedMonths.map(month => monthlyData[month].expense);

  netIncomeChartInstance = new window.Chart(netIncomeChartEl, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Pemasukan',
          data: incomeData,
          backgroundColor: '#4bc0c0',
          borderColor: '#4bc0c0',
          borderWidth: 1
        },
        {
          label: 'Pengeluaran',
          data: expenseData,
          backgroundColor: '#ff6384',
          borderColor: '#ff6384',
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              label += formatRupiah(context.raw);
              return label;
            }
          }
        }
      },
      scales: {
        x: {
          stacked: false,
          grid: {
            display: false
          }
        },
        y: {
          stacked: false,
          beginAtZero: true,
          ticks: {
            callback: function(value, index, values) {
              return formatRupiah(value);
            }
          }
        }
      }
    }
  });
}

// Fungsi untuk konversi dan unduh data transaksi sebagai CSV
function downloadCSV(transactions) {
  const csvHeader = ["Tanggal", "Waktu", "Tipe", "Jumlah", "Kategori", "Deskripsi", "Akun Bank"];
  const csvRows = [
    csvHeader.join(",")
  ];

  transactions.forEach(tx => {
    const accountName = userAccounts.find(acc => acc.id === tx.accountId)?.name || 'N/A'; // Get account name
    const row = [
      tx.date,
      tx.time,
      tx.type,
      tx.amount,
      `"${tx.category}"`,
      `"${tx.description.replace(/"/g, '""')}"`,
      `"${accountName}"`
    ];
    csvRows.push(row.join(","));
  });

  const csvString = csvRows.join("\n");
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", "laporan_keuangan.csv");
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

downloadReportBtn?.addEventListener("click", async () => {
  if (!currentUserId) return alert("User belum login.");
  try {
    let q = query(collection(db, "entries"), where("userId", "==", currentUserId));
    const selectedAccountIdFilter = filterAccountSelect.value; // Get selected account from filter

    // Apply account filter to download query too
    if (selectedAccountIdFilter !== "all") {
      q = query(q, where("accountId", "==", selectedAccountIdFilter));
    }

    const snapshot = await getDocs(q);

    const transactions = [];
    snapshot.forEach(docSnap => {
      transactions.push({ id: docSnap.id, ...docSnap.data() });
    });

    if (transactions.length === 0) {
      alert("Tidak ada transaksi untuk diunduh.");
      return;
    }

    downloadCSV(transactions);
  } catch (err) {
    console.error("Gagal mengunduh laporan:", err);
    alert("Terjadi kesalahan saat mengunduh laporan.");
  }
});

// --- Inisialisasi awal saat DOM siap ---
document.addEventListener("DOMContentLoaded", () => {
  if (!typeSelect.value) {
    typeSelect.value = "income";
  }
  updateCategoryOptions(typeSelect.value);

  // Initialize Datepicker
  $(function() {
    $("#filter-date-from").datepicker({
      dateFormat: "yy-mm-dd" // Sesuaikan format tanggal Firestore Anda
    });
    $("#filter-date-to").datepicker({
      dateFormat: "yy-mm-dd" // Sesuaikan format tanggal Firestore Anda
    });
  });
});