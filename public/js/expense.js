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

// --- DOM Elements ---
const amountInput = document.getElementById("amount");
const typeSelect = document.getElementById("type");
const categorySelect = document.getElementById("category");
const filterType = document.getElementById("filter-type");
const filterCategory = document.getElementById("filter-category");
const transactionList = document.getElementById("transaction-list");
const balanceText = document.getElementById("balance");
const totalIncomeText = document.getElementById("total-income");
const totalExpenseText = document.getElementById("total-expense");
const form = document.getElementById("expenseForm");
const logoutBtn = document.getElementById("logoutBtn");
const categoryChartEl = document.getElementById("categoryChart");

// --- Helpers ---
function updateCategoryOptions(type, selectEl = categorySelect) {
  const categories = type === "income" ? incomeCategories : expenseCategories;
  selectEl.innerHTML = "";
  categories.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    selectEl.appendChild(opt);
  });
}

// For category filter dropdown (can show all categories, or only income/expense)
function updateFilterCategoryOptions() {
  let cats = [];
  if (filterType.value === "income") cats = incomeCategories;
  else if (filterType.value === "expense") cats = expenseCategories;
  else cats = [...incomeCategories, ...expenseCategories];
  filterCategory.innerHTML = "<option value='all'>All Categories</option>";
  cats.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    filterCategory.appendChild(opt);
  });
}

// --- UI handlers ---
typeSelect.addEventListener("change", () => updateCategoryOptions(typeSelect.value));
amountInput.addEventListener("input", (e) => {
  const value = e.target.value.replace(/[^0-9]/g, "");
  amountInput.value = value ? formatRupiah(value) : "";
});
filterType.addEventListener("change", () => {
  updateFilterCategoryOptions();
  fetchEntries(currentUserId);
});
filterCategory.addEventListener("change", () => fetchEntries(currentUserId));

// --- Auth ---
let currentUserId = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("Logout Successfully");
    window.location.href = "login.html";
    return;
  }
  currentUserId = user.uid;
  // document.getElementById("user-email").textContent = user.email || "User";
  // const userDocRef = doc(db, "users", currentUserId);
  // const userDocSnap = await getDoc(userDocRef);
  // if (userDocSnap.exists() && userDocSnap.data().name) {
  //   document.getElementById("user-name").textContent = userDocSnap.data().name;
  // }
  const userDocRef = doc(db, "users", currentUserId);
  const userDocSnap = await getDoc(userDocRef);
  if (userDocSnap.exists() && userDocSnap.data().name) {
    document.getElementById("user-name").textContent = userDocSnap.data().name;
  } else {
    document.getElementById("user-name").textContent = "User";
  }

  updateCategoryOptions(typeSelect.value);
  updateFilterCategoryOptions();
  fetchEntries(currentUserId);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const amount = parseInt(amountInput.value.replace(/[^0-9]/g, ""));
    const description = document.getElementById("desc").value.trim();
    const category = categorySelect.value;
    const date = document.getElementById("date").value;
    const time = document.getElementById("time").value;
    const type = typeSelect.value;
    if (!amount || isNaN(amount) || amount <= 0) return alert("Enter valid amount");
    if (description.length < 3) return alert("Description too short");
    try {
      await addDoc(collection(db, "entries"), {
        userId: currentUserId, amount, description, category, date, time, type,
        createdAt: new Date()
      });
      e.target.reset();
      updateCategoryOptions(typeSelect.value);
      fetchEntries(currentUserId);
    } catch (err) {
      console.error("Add failed", err);
      alert("Failed to add entry.");
    }
  });

  logoutBtnSidebar?.addEventListener("click", async () => {
    const confirmLogout = confirm("Are you sure you want to log out?");
    if (!confirmLogout) return;
    
    try {
      await signOut(auth);
      localStorage.clear();
      window.location.href = "login.html";
    } catch (err) {
      console.error("Logout error:", err);
      alert("Failed to logout");
    }
  });
});

// --- Data fetch and render ---
async function fetchEntries(userId) {
  const q = query(collection(db, "entries"), where("userId", "==", userId));
  const snapshot = await getDocs(q);

  // Filter logic
  const selectedType = filterType.value;
  const selectedCategory = filterCategory?.value;
  const grouped = {};
  let totalIncome = 0;
  let totalExpense = 0;
  let allEntries = [];

  snapshot.forEach((docSnap) => {
    const item = { id: docSnap.id, ...docSnap.data() };
    // Filter by type and category for the transaction list (not the chart)
    if (selectedType !== "all" && item.type !== selectedType) return;
    if (selectedCategory && selectedCategory !== "all" && item.category !== selectedCategory) return;
    if (!grouped[item.date]) grouped[item.date] = [];
    grouped[item.date].push(item);
    allEntries.push(item);

    if (item.type === "income") totalIncome += item.amount;
    else if (item.type === "expense") totalExpense += item.amount;
  });

  // Update balance, income, expense
  const balance = totalIncome - totalExpense;
  balanceText.textContent = formatRupiah(balance);
  totalIncomeText.textContent = formatRupiah(totalIncome);
  totalExpenseText.textContent = formatRupiah(totalExpense);
  balanceText.classList.toggle("positive", balance >= 0);
  balanceText.classList.toggle("negative", balance < 0);

  // Render transaction list
  transactionList.innerHTML = "";
  // Sort dates descending
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
                <div><strong>Type:</strong> ${item.type}</div>
                <div><strong>Category:</strong> ${item.category}</div>
                <div><strong>Description:</strong> ${item.description}</div>
                <div><strong>Time:</strong> ${item.time}</div>
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
        document.getElementById("desc").value = item.description;
        document.getElementById("date").value = item.date;
        document.getElementById("time").value = item.time;
        await deleteDoc(doc(db, "entries", item.id));
        fetchEntries(userId);
      };
      transactionList.appendChild(wrapper);
    });
  });

  // --- Render Analytics Chart ---
  renderCategoryChart(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })));
}

// --- Analytics: Pie Chart by Income/Expense or Category ---
let chartInstance = null;
function renderCategoryChart(allEntries) {
  if (!categoryChartEl) return;

  // Make the chart smaller (responsive)
  categoryChartEl.width = 350;
  categoryChartEl.height = 220;

  const type = filterType.value;
  let data, labels, bgColors;

  if (type === "all") {
    // Show ratio of income vs expense
    const incomeSum = allEntries.filter(e => e.type === "income").reduce((a, b) => a + b.amount, 0);
    const expenseSum = allEntries.filter(e => e.type === "expense").reduce((a, b) => a + b.amount, 0);
    labels = ["Income", "Expense"];
    data = [incomeSum, expenseSum];
    bgColors = ["#4bc0c0", "#ff6384"];
  } else {
    // Show breakdown by category for selected type
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

// --- Init ---
document.addEventListener("DOMContentLoaded", () => {
  updateCategoryOptions(typeSelect.value);
  updateFilterCategoryOptions();
});