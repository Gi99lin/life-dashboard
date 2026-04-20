/**
 * LoginModal.js — Cookie-based auth via /api/login
 */

export async function initAuth() {
  try {
    const res = await fetch('/api/auth-check');
    if (res.ok) return true;
  } catch {}
  return false;
}

export function showLoginModal(errorMsg = '') {
  // Hide main app
  const appEl = document.getElementById('app');
  if (appEl) appEl.style.display = 'none';

  let modal = document.getElementById('loginModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'loginModal';
    modal.className = 'login-modal';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="login-box">
      <h2>🌿 LifeOS</h2>
      <p class="login-sub">Введите пароль для доступа</p>
      <input type="password" id="loginPass" placeholder="Пароль..." autofocus />
      ${errorMsg ? `<div class="login-error">${errorMsg}</div>` : ''}
      <button id="loginBtn">Войти</button>
    </div>
  `;

  document.getElementById('loginBtn').addEventListener('click', doLogin);
  document.getElementById('loginPass').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') doLogin();
  });

  // Focus with slight delay (for animation)
  setTimeout(() => document.getElementById('loginPass')?.focus(), 100);
}

async function doLogin() {
  const passEl = document.getElementById('loginPass');
  const password = passEl?.value?.trim();
  if (!password) return;

  const btn = document.getElementById('loginBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '...';
  }

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      window.location.reload();
    } else {
      showLoginModal('Неверный пароль');
    }
  } catch (err) {
    showLoginModal('Ошибка соединения');
  }
}
