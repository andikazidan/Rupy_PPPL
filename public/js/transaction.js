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
const filterTypeMain = document.getElementById("filter-all");
const filterDateFromInput = document.getElementById("filter-date-from");
const filterDateToInput = document.getElementById("filter-date-to");
const applyDateFilterBtn = document.getElementById("apply-date-filter-btn");
const clearFilterBtn = document.getElementById("clear-filter-btn");

// --- DOM Elements (untuk modal Add Transaction, sama seperti expense.js) ---
const expenseForm = document.getElementById("expenseForm");
const typeSelect = document.getElementById("type");
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

// --- Helpers (Sama seperti expense.js) ---
function updateCategoryOptions(type, selectEl) {
  const targetSelect = selectEl || categorySelect;
  const categories = type === "income" ? incomeCategories : expenseCategories;
  targetSelect.innerHTML = "";
  categories.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    targetSelect.appendChild(opt);
  });
}

// --- Penangan UI Modal (Sama seperti expense.js) ---
typeSelect.addEventListener("change", () => updateCategoryOptions(typeSelect.value));
amountInput.addEventListener("input", (e) => {
  const value = e.target.value.replace(/[^0-9]/g, "");
  amountInput.value = value ? formatRupiah(value) : "";
});
addTransactionBtn.addEventListener('click', () => {
  expenseForm.reset();
  typeSelect.value = "income";
  updateCategoryOptions(typeSelect.value);
  transactionModal.show();
});
transactionModalElement.addEventListener('shown.bs.modal', () => {
  updateCategoryOptions(typeSelect.value);
});


// --- Auth dan Fetch Data Halaman Transaksi ---
let currentUserId = null;

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

  // Initial fetch with no filters
  await fetchTransactions(currentUserId);

  // Event Listeners for main page filters
  filterTypeMain.addEventListener("change", () => {
    fetchTransactions(currentUserId);
  });

  // Date range filter event listener
  applyDateFilterBtn.addEventListener("click", () => {
    const startDateStr = filterDateFromInput.value;
    const endDateStr = filterDateToInput.value;

    console.log("From (string):", startDateStr, "To (string):", endDateStr);

    // Client-side validation for date range
    if (startDateStr && endDateStr) {
      const [startY, startM, startD] = startDateStr.split('-').map(Number);
      const [endY, endM, endD] = endDateStr.split('-').map(Number);

      const startDate = new Date(startY, startM - 1, startD);
      const endDate = new Date(endY, endM - 1, endD);

      console.log("Parsed From Date (Object):", startDate, "Parsed To Date (Object):", endDate);
      console.log("Is From Date > To Date?", startDate > endDate);

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
    filterTypeMain.value = "all";
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
    if (!amount || isNaN(amount) || amount <= 0) return alert("Jumlah tidak valid.");
    if (description.length < 3) return alert("Deskripsi terlalu pendek (minimal 3 karakter).");
    try {
      await addDoc(collection(db, "entries"), {
        userId: currentUserId, amount, description, category, date, time, type,
        createdAt: new Date()
      });
      expenseForm.reset();
      typeSelect.value = "income";
      updateCategoryOptions(typeSelect.value);
      fetchTransactions(currentUserId);
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

// --- Fungsi untuk Mengambil dan Menampilkan Transaksi ---
async function fetchTransactions(userId) {
  let q = query(collection(db, "entries"), where("userId", "==", userId));

  const startDate = filterDateFromInput.value;
  const endDate = filterDateToInput.value;
  const selectedTypeMain = filterTypeMain.value;

  if (startDate) {
    q = query(q, where("date", ">=", startDate));
  }
  if (endDate) {
    q = query(q, where("date", "<=", endDate));
  }
  if (selectedTypeMain !== "all") {
    q = query(q, where("type", "==", selectedTypeMain));
  }

  console.log("Constructed Firestore Query:", q); // Debugging: Log the constructed query

  const snapshot = await getDocs(q);

  console.log("Firestore Snapshot is empty:", snapshot.empty); // Debugging: Check if snapshot is empty

  let totalIncome = 0;
  let totalExpense = 0;
  const groupedTransactions = {};
  const allEntriesForChart = [];

  snapshot.forEach((docSnap) => {
    const item = { id: docSnap.id, ...docSnap.data() };
    allEntriesForChart.push(item);

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

  if (filterTypeMain.value !== "all" || filterDateFromInput.value !== "" || filterDateToInput.value !== "") {
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
            </div>
        </div>
        <span class="${amountTextColor} fw-bold">${amountSign}${formatRupiah(item.amount)}</span>
      `;
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
  const csvHeader = ["Tanggal", "Waktu", "Tipe", "Jumlah", "Kategori", "Deskripsi"];
  const csvRows = [
    csvHeader.join(",")
  ];

  transactions.forEach(tx => {
    const row = [
      tx.date,
      tx.time,
      tx.type,
      tx.amount,
      `"${tx.category}"`,
      `"${tx.description.replace(/"/g, '""')}"`
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
    const q = query(collection(db, "entries"), where("userId", "==", currentUserId));
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