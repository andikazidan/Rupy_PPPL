import { db } from "./firebase-config.js";
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// --- DOM ---
const createAccountBtn = document.getElementById("createAccountBtn");
const accountModalElement = document.getElementById("accountModal");
const accountForm = document.getElementById("accountForm");
const accountNameInput = document.getElementById("accountName");

export function initAccountManager(currentUserId, reloadAccountsFn) {
  const accountModal = new bootstrap.Modal(accountModalElement);

  createAccountBtn?.addEventListener("click", () => {
    accountForm.reset();
    accountModal.show();
  });

  accountForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = accountNameInput.value.trim();
    if (name.length < 2) {
      alert("Nama akun terlalu pendek");
      return;
    }

    try {
      await addDoc(collection(db, "accounts"), {
        userId: currentUserId,
        name,
        createdAt: new Date()
      });
      accountModal.hide();
      await reloadAccountsFn(); // trigger ulang loadAccounts dari expense.js
    } catch (err) {
      console.error("Gagal menambah akun:", err);
      alert("Terjadi kesalahan.");
    }
  });
}