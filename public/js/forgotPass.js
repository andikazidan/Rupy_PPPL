const emailForm = document.getElementById('emailForm');
const passwordForm = document.getElementById('passwordForm');
const responseMsg = document.getElementById('responseMsg');
const backToEmail = document.getElementById('backToEmail');

let userEmail = ""; // Untuk menyimpan email yang dimasukkan

emailForm.addEventListener('submit', function (e) {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();

  if (email === "") {
    responseMsg.textContent = "Email tidak boleh kosong.";
    responseMsg.className = "message error";
    return;
  }

  // Simpan email untuk nanti (kalau mau dikirim ke backend)
  userEmail = email;

  // Ganti tampilan
  emailForm.classList.add('d-none');
  passwordForm.classList.remove('d-none');
  responseMsg.textContent = "";
});

passwordForm.addEventListener('submit', function (e) {
  e.preventDefault();

  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (newPassword.length < 6) {
    responseMsg.textContent = "Password minimal 6 karakter.";
    responseMsg.className = "message error";
    return;
  }

  if (newPassword !== confirmPassword) {
    responseMsg.textContent = "Password tidak sama.";
    responseMsg.className = "message error";
    return;
  }

  // Jika valid
  responseMsg.textContent = "Password berhasil direset.";
  responseMsg.className = "message success";

  // Simulasi kirim ke server bisa pakai fetch:
  /*
  fetch('/reset-password', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ email: userEmail, password: newPassword })
  })
  */

  // Redirect ke loading.html setelah 2 detik
  setTimeout(() => {
    window.location.href = "loading.html";
  }, 2000);
});

backToEmail.addEventListener('click', function (e) {
  e.preventDefault();
  passwordForm.classList.add('d-none');
  emailForm.classList.remove('d-none');
  responseMsg.textContent = "";
});
