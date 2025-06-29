// public/js/expense.js
import { auth, db } from "./firebase-config.js";
import {
  collection, addDoc, getDocs, deleteDoc, doc, query, where, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { formatRupiah } from "./utils.js";

// --- Categories ---
const incomeCategories = [
  "Salary", "Freelance", "Bonus", "Gift", "Investment", "Business", "Rental Income", "Dividends", "Cashback", "Other"
];
const expenseCategories = [
  "Food & Drinks", "Groceries", "Transport", "Fuel", "Parking", "Bills & Utilities", "Electricity", "Internet",
  "Mobile Plan", "Shopping", "Entertainment", "Health & Medical", "Insurance", "Education", "Subscriptions",
  "Travel", "Dining Out", "Donations", "Gifts", "Personal Care", "Household", "Pets", "Loan Payments", "Taxes", "Other"
];

// --- DOM Elements (References directly from the modal's form) ---
const expenseForm = document.getElementById("expenseForm"); // Formulir di dalam modal
const typeSelect = document.getElementById("type"); // Pilih tipe (di dalam modal form)
const amountInput = document.getElementById("amount"); // Input jumlah (di dalam modal form)
const categorySelect = document.getElementById("category"); // Pilih kategori (di dalam modal form)
const dateInput = document.getElementById("date"); // Input tanggal (di dalam modal form)
const timeInput = document.getElementById("time"); // Input waktu (di dalam modal form)
const descInput = document.getElementById("desc"); // Input deskripsi (di dalam modal form)

// Elemen halaman utama (di luar modal, untuk filter dan tampilan keseluruhan)
const filterType = document.getElementById("filter-type");
const filterCategory = document.getElementById("filter-category");
const transactionList = document.getElementById("transaction-list");
const balanceText = document.getElementById("balance");
const totalIncomeText = document.getElementById("total-income");
const totalExpenseText = document.getElementById("total-expense");
const logoutBtnSidebar = document.getElementById("logoutBtnSidebar");
const categoryChartEl = document.getElementById("categoryChart");
const addTransactionBtn = document.getElementById("addTransactionBtn");
const transactionModalElement = document.getElementById('transactionModal'); // Dapatkan elemen DOM modal
const transactionModal = new bootstrap.Modal(transactionModalElement); // Instance modal Bootstrap

// --- Helpers ---
function updateCategoryOptions(type, selectEl) {
  // Gunakan selectEl yang disediakan atau fallback ke categorySelect global jika tidak disediakan
  const targetSelect = selectEl || categorySelect;
  const categories = type === "income" ? incomeCategories : expenseCategories;
  targetSelect.innerHTML = ""; // Hapus opsi yang ada
  categories.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    targetSelect.appendChild(opt);
  });
}

// Untuk dropdown filter kategori (dapat menampilkan semua kategori, atau hanya pendapatan/pengeluaran)
function updateFilterCategoryOptions() {
  let cats = [];
  if (filterType.value === "income") cats = incomeCategories;
  else if (filterType.value === "expense") cats = expenseCategories;
  else cats = [...incomeCategories, ...expenseCategories];
  filterCategory.innerHTML = "<option value='all'>Semua Kategori</option>";
  cats.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    filterCategory.appendChild(opt);
  });
}

// --- Penangan UI ---
// Listener typeSelect untuk form modal
typeSelect.addEventListener("change", () => updateCategoryOptions(typeSelect.value));

amountInput.addEventListener("input", (e) => {
  const value = e.target.value.replace(/[^0-9]/g, "");
  amountInput.value = value ? formatRupiah(value) : "";
});

// Listener untuk select filter (di halaman utama)
filterType.addEventListener("change", () => {
  updateFilterCategoryOptions();
  fetchEntries(currentUserId);
});
filterCategory.addEventListener("change", () => fetchEntries(currentUserId));

// Event listener untuk tombol "Add Transactions" untuk menampilkan modal
addTransactionBtn.addEventListener('click', () => {
  expenseForm.reset(); // Reset form saat modal dibuka
  typeSelect.value = "income"; // Set tipe default
  updateCategoryOptions(typeSelect.value); // Isi dropdown kategori berdasarkan tipe default
  transactionModal.show(); // Tampilkan modal Bootstrap
});

// Tambahkan event listener saat modal sepenuhnya ditampilkan
transactionModalElement.addEventListener('shown.bs.modal', () => {
  // Pastikan dropdown kategori diisi saat modal ditampilkan
  updateCategoryOptions(typeSelect.value);
});


// --- Autentikasi ---
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
    document.getElementById("user-name").textContent = userDocSnap.data().name;
  } else {
    document.getElementById("user-name").textContent = "Pengguna";
  }

  // Pengaturan awal untuk filter kategori halaman utama
  updateFilterCategoryOptions();
  fetchEntries(currentUserId);

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
      expenseForm.reset(); // Reset form setelah pengiriman
      typeSelect.value = "income"; // Reset tipe ke default untuk entri berikutnya
      updateCategoryOptions(typeSelect.value); // Perbarui kategori untuk form yang direset
      fetchEntries(currentUserId);
      transactionModal.hide(); // Sembunyikan modal setelah pengiriman berhasil
    } catch (err) {
      console.error("Gagal menambahkan entri:", err);
      alert("Gagal menambahkan entri. Silakan coba lagi.");
    }
  });

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

// --- Pengambilan dan Rendering Data ---
async function fetchEntries(userId) {
  const q = query(collection(db, "entries"), where("userId", "==", userId));
  const snapshot = await getDocs(q);

  // Logika filter
  const selectedType = filterType.value;
  const selectedCategory = filterCategory?.value;
  const grouped = {};
  let totalIncome = 0;
  let totalExpense = 0;
  let allEntries = [];

  snapshot.forEach((docSnap) => {
    const item = { id: docSnap.id, ...docSnap.data() };
    // Filter berdasarkan tipe dan kategori untuk daftar transaksi (bukan grafik)
    if (selectedType !== "all" && item.type !== selectedType) return;
    if (selectedCategory && selectedCategory !== "all" && item.category !== selectedCategory) return;
    if (!grouped[item.date]) grouped[item.date] = [];
    grouped[item.date].push(item);
    allEntries.push(item);

    if (item.type === "income") totalIncome += item.amount;
    else if (item.type === "expense") totalExpense += item.amount;
  });

  // Perbarui saldo, pendapatan, pengeluaran
  const balance = totalIncome - totalExpense;
  balanceText.textContent = formatRupiah(balance);
  if (totalIncomeText) totalIncomeText.textContent = formatRupiah(totalIncome);
  if (totalExpenseText) totalExpenseText.textContent = formatRupiah(totalExpense);
  balanceText.classList.toggle("positive", balance >= 0);
  balanceText.classList.toggle("negative", balance < 0);

  // Render daftar transaksi
  transactionList.innerHTML = "";
  // Urutkan tanggal menurun
  Object.keys(grouped).sort((a, b) => b.localeCompare(a)).forEach(date => {
    const dateHeader = document.createElement("div");
    dateHeader.className = "date-header my-2 border-bottom pb-1 text-muted small";
    dateHeader.textContent = date;
    transactionList.appendChild(dateHeader);
    grouped[date].forEach(item => {
      const wrapper = document.createElement("div");
      wrapper.className = `transaction-box ${item.type}`;
      const icon = item.type === "income"
        ? '<i class="bi bi-caret-down-fill text-success"></i>'
        : '<i class="bi bi-caret-up-fill text-danger"></i>';
      wrapper.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
          <div class="d-flex">
            <div class="me-2">${icon}</div>
            <div>
              <strong class="text-amount">${formatRupiah(item.amount)}</strong>
              <div class="transaction-details d-none">
                <div><strong>Tipe:</strong> ${item.type}</div>
                <div><strong>Kategori:</strong> ${item.category}</div>
                <div><strong>Deskripsi:</strong> ${item.description}</div>
                <div><strong>Waktu:</strong> ${item.time}</div>
              </div>
            </div>
          </div>
          <div class="entry-action-buttons">
            <button class="btn btn-edit-icon"><i class="bi bi-pencil-square"></i></button>
            <button class="btn btn-delete-icon"><i class="bi bi-trash"></i></button>
          </div>
        </div>`;
      const detailSection = wrapper.querySelector(".transaction-details");
      wrapper.addEventListener("click", (e) => {
        if (!e.target.closest(".entry-action-buttons")) {
          detailSection.classList.toggle("d-none");
        }
      });
      wrapper.querySelector(".btn-delete-icon").onclick = async () => {
        await deleteDoc(doc(db, "entries", item.id));
        fetchEntries(userId);
      };
      wrapper.querySelector(".btn-edit-icon").onclick = async () => {
        typeSelect.value = item.type;
        updateCategoryOptions(item.type);
        categorySelect.value = item.category;
        amountInput.value = formatRupiah(item.amount);
        descInput.value = item.description;
        dateInput.value = item.date;
        timeInput.value = item.time;
        transactionModal.show(); // Tampilkan modal untuk pengeditan
        // Ketika mengedit, hapus entri lama setelah mendapatkan datanya,
        // sehingga pengguna dapat menambahkannya kembali dengan modifikasi.
        // Untuk kesederhanaan, mempertahankan perilaku saat ini yaitu menghapus dan menambahkan kembali.
        await deleteDoc(doc(db, "entries", item.id));
        fetchEntries(userId);
      };
      transactionList.appendChild(wrapper);
    });
  });

  // --- Render Grafik Analitik ---
  renderCategoryChart(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })));
}

// --- Analitik: Pie Chart berdasarkan Pendapatan/Pengeluaran atau Kategori ---
let chartInstance = null;
function renderCategoryChart(allEntries) {
  if (!categoryChartEl) return;

  // Jadikan grafik lebih kecil (responsif)
  categoryChartEl.width = 350;
  categoryChartEl.height = 220;

  const type = filterType.value;
  let data, labels, bgColors;

  if (type === "all") {
    // Tampilkan rasio pendapatan vs pengeluaran
    const incomeSum = allEntries.filter(e => e.type === "income").reduce((a, b) => a + b.amount, 0);
    const expenseSum = allEntries.filter(e => e.type === "expense").reduce((a, b) => a + b.amount, 0);
    labels = ["Pemasukan", "Pengeluaran"];
    data = [incomeSum, expenseSum];
    bgColors = ["#4bc0c0", "#ff6384"];
  } else {
    // Tampilkan rincian berdasarkan kategori untuk tipe yang dipilih
    const filtered = allEntries.filter(e => e.type === type);
    const catSum = {};
    filtered.forEach(e => {
      catSum[e.category] = (catSum[e.category] || 0) + e.amount;
    });
    labels = Object.keys(catSum);
    data = Object.values(catSum);
    bgColors = [
      "#ff6384", "#36a2eb", "#ffcd56", "#4bc0c0", "#9966ff", "#ff9f40",
      "#b2dfdb", "#b39ddb", "#ffe082", "#aed581", "#f8bbd0", "#90caf9"
    ];
  }

  if (chartInstance) chartInstance.destroy();
  chartInstance = new window.Chart(categoryChartEl, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: bgColors,
      }]
    },
    options: {
      plugins: {
        legend: { position: 'bottom' }
      }
    }
  });
}

// --- Inisialisasi awal saat DOM siap ---
// Pastikan categorySelect diisi saat halaman dimuat, terutama untuk kasus edit yang membuka modal.
document.addEventListener("DOMContentLoaded", () => {
  // Set nilai default 'income' jika belum ada untuk memastikan updateCategoryOptions memiliki basis
  if (!typeSelect.value) {
    typeSelect.value = "income"; // Set nilai default jika belum ada
  }
  updateCategoryOptions(typeSelect.value); // Inisialisasi opsi kategori untuk formulir modal
});