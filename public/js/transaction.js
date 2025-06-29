// public/js/transaction.js
import { auth, db } from "./firebase-config.js";
import {
  collection, addDoc, getDocs, query, where, getDoc, deleteDoc, doc // Menambahkan deleteDoc dan doc untuk edit/hapus
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
const netIncomeChartEl = document.getElementById("netIncomeChart"); // Element canvas untuk grafik
const logoutBtnSidebar = document.getElementById("logoutBtnSidebar"); // Sidebar logout button
const filterMonth = document.getElementById("filter-month"); // Filter bulan 03/2025 (jika ada)
const filterLastMonthBtn = document.getElementById("lastMonthBtn"); // Tombol LAST MONTH
const filterThisMonthBtn = document.getElementById("thisMonthBtn"); // Tombol THIS MONTH
const downloadReportBtn = document.getElementById("downloadReportBtn"); // Tombol Unduh Laporan Keuangan

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
    // Jika ada elemen untuk nama pengguna di halaman ini, perbarui
    // document.getElementById("user-name").textContent = userDocSnap.data().name; // Pastikan ada di transaction.html jika ingin menampilkan nama user
  }

  fetchTransactions(currentUserId); // Panggil fungsi untuk mengambil dan menampilkan transaksi

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
      // Menambahkan transaksi baru
      await addDoc(collection(db, "entries"), {
        userId: currentUserId, amount, description, category, date, time, type,
        createdAt: new Date()
      });
      expenseForm.reset();
      typeSelect.value = "income";
      updateCategoryOptions(typeSelect.value);
      fetchTransactions(currentUserId); // Muat ulang transaksi setelah menambah
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
  const q = query(collection(db, "entries"), where("userId", "==", userId));
  const snapshot = await getDocs(q);

  let totalIncome = 0;
  let totalExpense = 0;
  const groupedTransactions = {}; // Untuk mengelompokkan transaksi berdasarkan tanggal

  const allEntries = []; // Simpan semua entri untuk grafik

  snapshot.forEach((docSnap) => {
    const item = { id: docSnap.id, ...docSnap.data() };
    allEntries.push(item); // Tambahkan ke daftar semua entri
    
    const date = item.date; // Tanggal transaksi

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

  // Perbarui ringkasan income/outcome
  if (summaryIncomeText) summaryIncomeText.textContent = formatRupiah(totalIncome);
  if (summaryOutcomeText) summaryOutcomeText.textContent = formatRupiah(totalExpense);
  
  // Perbarui Net Income
  const netIncome = totalIncome - totalExpense;
  if (netIncomeText) netIncomeText.textContent = formatRupiah(netIncome);

  // Render daftar transaksi
  transactionListContainer.innerHTML = "";
  const sortedDates = Object.keys(groupedTransactions).sort((a, b) => b.localeCompare(a)); // Urutkan tanggal dari terbaru

  sortedDates.forEach(date => {
    const dateHeaderDiv = document.createElement("div"); // Menggunakan div sebagai wrapper
    dateHeaderDiv.className = "transaction-group mb-3"; // Kelas untuk styling group
    
    const dateHeaderH6 = document.createElement("h6");
    dateHeaderH6.className = "text-muted mb-2";
    dateHeaderH6.textContent = date; // Anda bisa memformat tanggal di sini jika perlu
    dateHeaderDiv.appendChild(dateHeaderH6);

    groupedTransactions[date].forEach(item => {
      const transactionItemDiv = document.createElement("div");
      transactionItemDiv.className = `transaction-item d-flex align-items-center justify-content-between bg-light p-3 rounded mb-2`;

      // Tentukan warna ikon dan teks jumlah berdasarkan tipe transaksi
      const iconClass = item.type === "income" ? "bi-arrow-down-circle-fill" : "bi-arrow-up-circle-fill"; // Ikon panah ke bawah untuk income, ke atas untuk expense
      const iconBgColor = item.type === "income" ? "text-success" : "text-danger"; // Warna ikon untuk income/expense
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
      dateHeaderDiv.appendChild(transactionItemDiv); // Tambahkan item transaksi ke dalam group tanggal
    });
    transactionListContainer.appendChild(dateHeaderDiv); // Tambahkan group tanggal ke container utama
  });

  // Render Chart Net Income
  renderNetIncomeChart(allEntries); // Kirim semua entri ke fungsi grafik
}

// Fungsi untuk me-render chart
let netIncomeChartInstance = null;
function renderNetIncomeChart(allEntries) {
  if (!netIncomeChartEl) return;

  // Hancurkan instance chart yang lama jika ada
  if (netIncomeChartInstance) {
    netIncomeChartInstance.destroy();
  }

  // Mengumpulkan data berdasarkan bulan
  const monthlyData = {}; // Format: { "YYYY-MM": { income: 0, expense: 0 } }

  allEntries.forEach(item => {
    const yearMonth = item.date.substring(0, 7); // Ambil YYYY-MM
    if (!monthlyData[yearMonth]) {
      monthlyData[yearMonth] = { income: 0, expense: 0 };
    }
    if (item.type === "income") {
      monthlyData[yearMonth].income += item.amount;
    } else {
      monthlyData[yearMonth].expense += item.amount;
    }
  });

  const sortedMonths = Object.keys(monthlyData).sort(); // Urutkan bulan

  const labels = sortedMonths.map(month => {
    const [year, mon] = month.split('-');
    const date = new Date(year, parseInt(mon) - 1, 1); // Buat objek tanggal
    return date.toLocaleString('id-ID', { month: 'short', year: '2-digit' }); // Format menjadi 'Jun 25'
  });
  const incomeData = sortedMonths.map(month => monthlyData[month].income);
  const expenseData = sortedMonths.map(month => monthlyData[month].expense);

  netIncomeChartInstance = new window.Chart(netIncomeChartEl, {
    type: 'bar', // Menggunakan bar chart sesuai gambar
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Pemasukan',
          data: incomeData,
          backgroundColor: '#4bc0c0', // Hijau toska
          borderColor: '#4bc0c0',
          borderWidth: 1
        },
        {
          label: 'Pengeluaran',
          data: expenseData,
          backgroundColor: '#ff6384', // Merah muda
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
          stacked: false, // Tidak ditumpuk agar terlihat batang income dan expense terpisah
          grid: {
            display: false // Sembunyikan grid vertikal
          }
        },
        y: {
          stacked: false, // Tidak ditumpuk
          beginAtZero: true,
          ticks: {
            callback: function(value, index, values) {
              return formatRupiah(value); // Format angka di sumbu Y
            }
          }
        }
      }
    }
  });
}

// --- Inisialisasi awal saat DOM siap ---
document.addEventListener("DOMContentLoaded", () => {
  // Pastikan categorySelect diisi saat halaman dimuat, terutama untuk kasus edit yang membuka modal.
  if (!typeSelect.value) {
    typeSelect.value = "income"; // Set nilai default jika belum ada
  }
  updateCategoryOptions(typeSelect.value); // Inisialisasi opsi kategori untuk formulir modal
});