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
const bankAccountSelect = document.getElementById("bankAccountSelect"); // NEW: Bank Account Select
const amountInput = document.getElementById("amount"); // Input jumlah (di dalam modal form)
const categorySelect = document.getElementById("category"); // Pilih kategori (di dalam modal form)
const dateInput = document.getElementById("date"); // Input tanggal (di dalam modal form)
const timeInput = document.getElementById("time"); // Input waktu (di dalam modal form)
const descInput = document.getElementById("desc"); // Input deskripsi (di dalam modal form)

// Elemen halaman utama (di luar modal, untuk filter dan tampilan keseluruhan)
const filterType = document.getElementById("filter-type");
const filterCategory = document.getElementById("filter-category");
const transactionList = document.getElementById("transaction-list");
const balanceText = document.getElementById("balance"); // This now holds global total balance
const totalIncomeText = document.getElementById("total-income"); // Not used for global balance anymore, keep for potential future use or remove if truly not needed.
const totalExpenseText = document.getElementById("total-expense"); // Same as above.
const logoutBtnSidebar = document.getElementById("logoutBtnSidebar");
const categoryChartEl = document.getElementById("categoryChart");
const addTransactionBtn = document.getElementById("addTransactionBtn");
const transactionModalElement = document.getElementById('transactionModal'); // Dapatkan elemen DOM modal
const transactionModal = new bootstrap.Modal(transactionModalElement); // Instance modal Bootstrap

// New account management elements
const expenseTrackerSection = document.getElementById("expense-tracker-section");
const accountManagementSection = document.getElementById("account-management-section");
const viewAccountsBtn = document.getElementById("viewAccountsBtn");
const backToExpenseBtn = document.getElementById("backToExpenseBtn");
const addNewAccountBtn = document.getElementById("addNewAccountBtn");
const accountsListContainer = document.getElementById("accounts-list");
const newAccountModalElement = document.getElementById('newAccountModal');
const newAccountModal = new bootstrap.Modal(newAccountModalElement);
const newAccountForm = document.getElementById("newAccountForm");
const newAccountNameInput = document.getElementById("newAccountName");
const newAccountNumberInput = document.getElementById("newAccountNumber");


let currentUserId = null;
let allTransactions = []; // Store all transactions for the current user
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

function updateBankAccountOptions(selectEl, accounts) {
  selectEl.innerHTML = '<option value="">Pilih Akun Bank</option>'; // Default option
  if (accounts.length === 0) {
      // If no accounts, add a disabled option indicating so
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

// --- UI Event Handlers ---
typeSelect.addEventListener("change", () => updateCategoryOptions(typeSelect.value));

amountInput.addEventListener("input", (e) => {
  const value = e.target.value.replace(/[^0-9]/g, "");
  amountInput.value = value ? formatRupiah(value) : "";
});

filterType.addEventListener("change", () => {
  updateFilterCategoryOptions();
  renderTransactionsAndChart(); // Re-render based on stored allTransactions and new filter
});
filterCategory.addEventListener("change", () => renderTransactionsAndChart()); // Re-render based on stored allTransactions and new filter

// MODIFIKASI UTAMA DI SINI untuk Add Transaction Button
addTransactionBtn.addEventListener('click', async () => {
  expenseForm.reset();
  typeSelect.value = "income";
  updateCategoryOptions(typeSelect.value);
  await fetchUserAccounts(currentUserId); // Ensure userAccounts is up-to-date

  if (userAccounts.length === 0) {
    // Jika tidak ada akun, alihkan langsung ke halaman manajemen akun
    expenseTrackerSection.classList.add('d-none');
    accountManagementSection.classList.remove('d-none');
    await renderAccountList(currentUserId); // Render daftar akun (akan kosong atau menunjukkan pesan)
    // Hentikan proses pembukaan modal transaksi
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

viewAccountsBtn.addEventListener('click', async () => {
  expenseTrackerSection.classList.add('d-none');
  accountManagementSection.classList.remove('d-none');
  await renderAccountList(currentUserId);
});

backToExpenseBtn.addEventListener('click', () => {
  accountManagementSection.classList.add('d-none');
  expenseTrackerSection.classList.remove('d-none');
  fetchEntries(currentUserId); // Re-fetch or re-render main expense data if necessary
});

addNewAccountBtn.addEventListener('click', () => {
  newAccountForm.reset();
  newAccountModal.show();
});

newAccountForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = newAccountNameInput.value.trim();
  const accountNumber = newAccountNumberInput.value.trim();

  if (name.length < 2) {
    alert("Nama akun terlalu pendek.");
    return;
  }
  if (accountNumber.length < 5) { // Basic validation
    alert("Nomor rekening tidak valid.");
    return;
  }

  try {
    await addDoc(collection(db, "accounts"), {
      userId: currentUserId,
      name: name,
      accountNumber: accountNumber,
      createdAt: new Date()
    });
    newAccountModal.hide();
    await renderAccountList(currentUserId); // Reload accounts in the account management section
    await fetchEntries(currentUserId); // Re-calculate global total balance and update main view
  } catch (err) {
    console.error("Gagal menambah akun:", err);
    alert("Terjadi kesalahan saat menambah akun.");
  }
});


// --- Authentication and Initial Data Fetch ---
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("Please login first.");
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

  // Initial setup for category filter on main page
  updateFilterCategoryOptions();
  await fetchUserAccounts(currentUserId); // Fetch accounts once on auth change
  await fetchEntries(currentUserId); // Fetch all entries initially

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
        amount,
        description,
        category,
        date,
        time,
        type,
        createdAt: new Date()
      });

      expenseForm.reset();
      typeSelect.value = "income";
      updateCategoryOptions(typeSelect.value);
      await fetchEntries(currentUserId); // Re-fetch all entries and update totals/chart
      transactionModal.hide();
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

// --- Fetch All Entries (without account filter) ---
async function fetchEntries(userId) {
  const q = query(collection(db, "entries"), where("userId", "==", userId));
  const snapshot = await getDocs(q);

  allTransactions = []; // Reset allTransactions
  snapshot.forEach((docSnap) => {
    allTransactions.push({ id: docSnap.id, ...docSnap.data() });
  });

  await calculateAndDisplayGlobalBalance(); // Calculate global balance based on all entries
  renderTransactionsAndChart(); // Render filtered transactions and chart
}

// --- Fetch User Accounts ---
async function fetchUserAccounts(userId) {
    userAccounts = [];
    const qAccounts = query(collection(db, "accounts"), where("userId", "==", userId));
    const accountsSnapshot = await getDocs(qAccounts);
    accountsSnapshot.forEach(docSnap => {
        userAccounts.push({ id: docSnap.id, ...docSnap.data() });
    });
    updateBankAccountOptions(bankAccountSelect, userAccounts);
}

// --- Calculate and Display Global Balance ---
async function calculateAndDisplayGlobalBalance() {
  let globalTotalIncome = 0;
  let globalTotalExpense = 0;

  // Use allTransactions to calculate the global balance
  allTransactions.forEach(item => {
    if (item.type === "income") globalTotalIncome += item.amount;
    else if (item.type === "expense") globalTotalExpense += item.amount;
  });

  const globalBalance = globalTotalIncome - globalTotalExpense;
  balanceText.textContent = formatRupiah(globalBalance);
  balanceText.classList.toggle("positive", globalBalance >= 0);
  balanceText.classList.toggle("negative", globalBalance < 0);
}

// --- Render Transactions List and Chart based on current filters ---
function renderTransactionsAndChart() {
  const selectedType = filterType.value;
  const selectedCategory = filterCategory?.value;
  const filteredTransactions = allTransactions.filter(item => {
    if (selectedType !== "all" && item.type !== selectedType) return false;
    if (selectedCategory && selectedCategory !== "all" && item.category !== selectedCategory) return false;
    return true;
  });

  const grouped = {};
  filteredTransactions.forEach(item => {
    if (!grouped[item.date]) grouped[item.date] = [];
    grouped[item.date].push(item);
  });

  // Render daftar transaksi
  transactionList.innerHTML = "";
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
                <div><strong>Akun:</strong> ${userAccounts.find(acc => acc.id === item.accountId)?.name || 'N/A'}</div>
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
        await fetchEntries(currentUserId); // Re-fetch all entries after deletion
      };
      wrapper.querySelector(".btn-edit-icon").onclick = async () => {
        // Populate modal for editing
        typeSelect.value = item.type;
        updateCategoryOptions(item.type);
        bankAccountSelect.value = item.accountId; // Set selected account
        categorySelect.value = item.category;
        amountInput.value = formatRupiah(item.amount);
        descInput.value = item.description;
        dateInput.value = item.date;
        timeInput.value = item.time;
        
        // Show modal for editing
        transactionModal.show(); 
        
        // Delete old entry after user opens the modal for editing
        // The user will then resubmit with modifications, effectively updating it.
        await deleteDoc(doc(db, "entries", item.id)); 
        await fetchEntries(currentUserId); // Re-fetch all entries after deletion for edit
      };
      transactionList.appendChild(wrapper);
    });
  });

  renderCategoryChart(filteredTransactions); // Render chart based on filtered transactions
}

// --- Analitik: Pie Chart berdasarkan Pendapatan/Pengeluaran atau Kategori ---
let chartInstance = null;
function renderCategoryChart(entriesToChart) {
  if (!categoryChartEl) return;

  categoryChartEl.width = 350;
  categoryChartEl.height = 220;

  const type = filterType.value;
  let data, labels, bgColors;

  if (type === "all") {
    const incomeSum = entriesToChart.filter(e => e.type === "income").reduce((a, b) => a + b.amount, 0);
    const expenseSum = entriesToChart.filter(e => e.type === "expense").reduce((a, b) => a + b.amount, 0);
    labels = ["Pemasukan", "Pengeluaran"];
    data = [incomeSum, expenseSum];
    bgColors = ["#4bc0c0", "#ff6384"];
  } else {
    const filtered = entriesToChart.filter(e => e.type === type);
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

  // Only create chart if there's data to display
  if (data.every(val => val === 0)) {
    categoryChartEl.style.display = 'none'; // Hide chart if no data
  } else {
    categoryChartEl.style.display = 'block'; // Show chart if there's data
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
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: function(context) {
                let label = context.label || '';
                if (label) {
                  label += ': ';
                }
                label += formatRupiah(context.raw);
                return label;
              }
            }
          }
        }
      }
    });
  }
}

// --- Account Management Functions ---
async function renderAccountList(userId) {
  accountsListContainer.innerHTML = ''; // Clear previous list
  await fetchUserAccounts(userId); // Ensure userAccounts is up-to-date

  if (userAccounts.length === 0) {
    accountsListContainer.innerHTML = '<p class="text-muted text-center">Belum ada akun bank. Tambahkan satu!</p>';
    return;
  }

  for (const account of userAccounts) {
    const qTransactions = query(
      collection(db, "entries"),
      where("userId", "==", userId),
      where("accountId", "==", account.id)
    );
    const transactionsSnapshot = await getDocs(qTransactions);

    let currentBalance = 0;
    transactionsSnapshot.forEach(transactionDoc => {
      const transactionData = transactionDoc.data();
      if (transactionData.type === "income") {
        currentBalance += transactionData.amount;
      } else if (transactionData.type === "expense") {
        currentBalance -= transactionData.amount;
      }
    });

    const accountCard = document.createElement('div');
    accountCard.className = 'col-md-6 col-lg-4'; // Bootstrap grid classes
    accountCard.innerHTML = `
      <div class="account-card shadow-sm">
          <div class="d-flex justify-content-between align-items-center mb-2">
              <h6>${account.name}</h6>
              <button class="btn btn-sm btn-outline-danger delete-account-btn" data-account-id="${account.id}">
                  <i class="bi bi-trash"></i>
              </button>
          </div>
          <p>Nomor Rekening: ${account.accountNumber}</p>
          <p>Saldo: <span class="balance-amount">${formatRupiah(currentBalance)}</span></p>
      </div>
    `;
    accountsListContainer.appendChild(accountCard);

    // Add event listener for delete button
    accountCard.querySelector('.delete-account-btn').addEventListener('click', async (e) => {
        const accountIdToDelete = e.currentTarget.dataset.accountId;
        const confirmDelete = confirm("Apakah Anda yakin ingin menghapus akun ini? Semua transaksi yang terkait juga akan dihapus.");
        if (confirmDelete) {
            try {
                // Delete all transactions associated with this account first
                const qTxToDelete = query(collection(db, "entries"), where("accountId", "==", accountIdToDelete));
                const txToDeleteSnapshot = await getDocs(qTxToDelete);
                const deletePromises = [];
                txToDeleteSnapshot.forEach(txDoc => {
                    deletePromises.push(deleteDoc(doc(db, "entries", txDoc.id)));
                });
                await Promise.all(deletePromises);

                // Then delete the account
                await deleteDoc(doc(db, "accounts", accountIdToDelete));
                alert("Akun dan transaksi terkait berhasil dihapus.");
                await renderAccountList(currentUserId); // Re-render the account list
                await fetchEntries(currentUserId); // Re-fetch all transactions to update global balance and main view
            } catch (error) {
                console.error("Error deleting account or transactions:", error);
                alert("Gagal menghapus akun. Silakan coba lagi.");
            }
        }
    });
  }
}


// --- Initial DOM Content Loaded Setup ---
document.addEventListener("DOMContentLoaded", () => {
  if (!typeSelect.value) {
    typeSelect.value = "income";
  }
  updateCategoryOptions(typeSelect.value); // Initialize category options for the modal form
});