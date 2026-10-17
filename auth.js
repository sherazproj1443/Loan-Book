
// FinTrack Pro - PIN Auth - Startup Only + Auto Lock on Close
const PIN_KEY = 'fintrack_pin_hash';
const PIN_ENABLED_KEY = 'fintrack_pin_enabled';
const PIN_SALT = 'fintrack_salt_2026';
const PIN_ATTEMPTS_KEY = 'fintrack_pin_attempts';
const PIN_LOCKOUT_KEY = 'fintrack_pin_lockout';
const SESSION_UNLOCKED = 'fintrack_session_unlocked';
const SESSION_LAST_ACTIVE = 'fintrack_session_last_active';
const PIN_LAST_ACTIVE = 'fintrack_last_active';

const AUTO_LOCK_MINUTES = 2; // Auto lock after 2 min inactivity or app close

function simpleHash(pin) {
  let str = PIN_SALT + pin + PIN_SALT;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return btoa(hash.toString() + '|' + str.length + '|' + pin.length * 31);
}

function isPinEnabled() {
  return localStorage.getItem(PIN_ENABLED_KEY) === 'true' && localStorage.getItem(PIN_KEY);
}

function isSessionUnlocked() {
  // Check if unlocked in this browser session
  if (sessionStorage.getItem(SESSION_UNLOCKED) !== 'true') return false;
  
  // Check if session expired (2 min inactivity)
  const lastActive = parseInt(sessionStorage.getItem(SESSION_LAST_ACTIVE) || '0');
  if (!lastActive) return false;
  
  const now = Date.now();
  const diffMinutes = (now - lastActive) / (1000 * 60);
  
  if (diffMinutes > AUTO_LOCK_MINUTES) {
    // Session expired
    sessionStorage.removeItem(SESSION_UNLOCKED);
    sessionStorage.removeItem(SESSION_LAST_ACTIVE);
    return false;
  }
  
  return true;
}

function checkLockout() {
  const lockout = localStorage.getItem(PIN_LOCKOUT_KEY);
  if (!lockout) return { locked: false };
  const lockoutTime = parseInt(lockout);
  const now = Date.now();
  if (now < lockoutTime) {
    const remaining = Math.ceil((lockoutTime - now) / 1000);
    return { locked: true, remaining };
  } else {
    localStorage.removeItem(PIN_LOCKOUT_KEY);
    localStorage.removeItem(PIN_ATTEMPTS_KEY);
    return { locked: false };
  }
}

function recordFailedAttempt() {
  let attempts = parseInt(localStorage.getItem(PIN_ATTEMPTS_KEY) || '0') + 1;
  localStorage.setItem(PIN_ATTEMPTS_KEY, attempts.toString());
  if (attempts >= 5) {
    const lockoutDuration = attempts >= 10 ? 5 * 60 * 1000 : 60 * 1000;
    localStorage.setItem(PIN_LOCKOUT_KEY, (Date.now() + lockoutDuration).toString());
    return lockoutDuration;
  }
  return 0;
}

function clearAttempts() {
  localStorage.removeItem(PIN_ATTEMPTS_KEY);
  localStorage.removeItem(PIN_LOCKOUT_KEY);
}

function unlockSession() {
  sessionStorage.setItem(SESSION_UNLOCKED, 'true');
  const now = Date.now().toString();
  sessionStorage.setItem(SESSION_LAST_ACTIVE, now);
  localStorage.setItem(PIN_LAST_ACTIVE, now);
  clearAttempts();
}

function lockSession() {
  sessionStorage.removeItem(SESSION_UNLOCKED);
  sessionStorage.removeItem(SESSION_LAST_ACTIVE);
}

function createPinUI() {
  if (document.getElementById('pinLockScreen')) return;
  
  const lockScreen = document.createElement('div');
  lockScreen.id = 'pinLockScreen';
  lockScreen.style.cssText = `
    position:fixed;inset:0;z-index:999999;background:#0f1210;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;
    font-family:Inter,sans-serif;
  `;
  lockScreen.innerHTML = `
    <div style="text-align:center;margin-bottom:30px">
      <div style="width:80px;height:80px;background:#171c19;border:1px solid #242e27;border-radius:20px;display:flex;align-items:center;justify-content:center;font-size:36px;margin:0 auto 16px">🔒</div>
      <h2 style="color:#e8efe9;font-size:22px;font-weight:800;margin-bottom:6px">FinTrack Pro</h2>
      <p style="color:#8da090;font-size:12px" id="pinLockMessage">Enter PIN to unlock</p>
      <p style="color:#ff4d4d;font-size:11px;margin-top:8px;display:none" id="pinLockoutMsg"></p>
    </div>
    
    <div style="display:flex;gap:12px;margin-bottom:24px" id="pinDots">
      <div class="pin-dot" style="width:14px;height:14px;border-radius:50%;background:#1e2521;border:2px solid #242e27"></div>
      <div class="pin-dot" style="width:14px;height:14px;border-radius:50%;background:#1e2521;border:2px solid #242e27"></div>
      <div class="pin-dot" style="width:14px;height:14px;border-radius:50%;background:#1e2521;border:2px solid #242e27"></div>
      <div class="pin-dot" style="width:14px;height:14px;border-radius:50%;background:#1e2521;border:2px solid #242e27"></div>
    </div>
    
    <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:12px;width:100%;max-width:260px;margin-bottom:20px">
      <button class="pin-key" data-key="1">1</button>
      <button class="pin-key" data-key="2">2</button>
      <button class="pin-key" data-key="3">3</button>
      <button class="pin-key" data-key="4">4</button>
      <button class="pin-key" data-key="5">5</button>
      <button class="pin-key" data-key="6">6</button>
      <button class="pin-key" data-key="7">7</button>
      <button class="pin-key" data-key="8">8</button>
      <button class="pin-key" data-key="9">9</button>
      <button class="pin-key" data-key="clear" style="font-size:14px;color:#8da090">⌫</button>
      <button class="pin-key" data-key="0">0</button>
      <button class="pin-key" data-key="enter" style="font-size:14px;color:#1ed760">✓</button>
    </div>
    
    <div style="display:flex;gap:12px;margin-top:10px">
      <button id="pinForgotBtn" style="background:transparent;border:none;color:#8da090;font-size:11px;text-decoration:underline">Forgot PIN?</button>
    </div>
    
    <style>
      .pin-key{width:100%;height:64px;background:#171c19;border:1px solid #242e27;border-radius:16px;color:#e8efe9;font-size:22px;font-weight:700;cursor:pointer;transition:all 0.1s}
      .pin-key:active{background:#1e2521;transform:scale(0.95)}
      .pin-dot.filled{background:#1ed760 !important;border-color:#1ed760 !important}
      .pin-dot.error{background:#ff4d4d !important;border-color:#ff4d4d !important;animation:shake 0.3s}
      @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
    </style>
  `;
  
  document.body.appendChild(lockScreen);
  
  let currentPin = '';
  const dots = lockScreen.querySelectorAll('.pin-dot');
  
  function updateDots() {
    dots.forEach((dot, idx) => {
      dot.classList.toggle('filled', idx < currentPin.length);
    });
  }
  
  function verifyPin(pin) {
    const lockout = checkLockout();
    if (lockout.locked) {
      const msg = document.getElementById('pinLockoutMsg');
      msg.style.display = 'block';
      msg.textContent = `Too many attempts. Try again in ${lockout.remaining}s`;
      return;
    }
    
    const hashed = simpleHash(pin);
    const stored = localStorage.getItem(PIN_KEY);
    
    if (hashed === stored) {
      // Success
      unlockSession();
      lockScreen.remove();
      startInactivityTimer();
    } else {
      // Fail
      const duration = recordFailedAttempt();
      dots.forEach(d => { d.classList.add('error'); setTimeout(()=>d.classList.remove('error'), 300); });
      currentPin = '';
      updateDots();
      
      const msgEl = document.getElementById('pinLockMessage');
      const attempts = parseInt(localStorage.getItem(PIN_ATTEMPTS_KEY) || '0');
      if (duration > 0) {
        msgEl.textContent = `Wrong PIN! Locked for ${Math.ceil(duration/1000)}s`;
        msgEl.style.color = '#ff4d4d';
      } else {
        msgEl.textContent = `Wrong PIN! Attempts: ${attempts}/5`;
        msgEl.style.color = '#ff4d4d';
        setTimeout(()=>{ msgEl.textContent='Enter PIN to unlock'; msgEl.style.color='#8da090'; }, 1500);
      }
    }
  }
  
  function handleKey(key) {
    const lockout = checkLockout();
    if (lockout.locked) {
      const msg = document.getElementById('pinLockoutMsg');
      msg.style.display = 'block';
      msg.textContent = `Too many attempts. Try again in ${lockout.remaining}s`;
      return;
    }
    
    if (key === 'clear') {
      currentPin = currentPin.slice(0, -1);
    } else if (key === 'enter') {
      if (currentPin.length === 4) {
        verifyPin(currentPin);
      }
      return;
    } else if (/[0-9]/.test(key) && currentPin.length < 4) {
      currentPin += key;
    }
    updateDots();
    if (currentPin.length === 4) {
      setTimeout(()=>verifyPin(currentPin), 200);
    }
  }
  
  lockScreen.querySelectorAll('.pin-key').forEach(btn => {
    btn.addEventListener('click', () => handleKey(btn.dataset.key));
  });
  
  lockScreen.querySelector('#pinForgotBtn').onclick = () => {
    if (confirm('Forgot PIN? This will clear your PIN and you can set a new one. Your financial data will remain. Continue?')) {
      const confirmText = prompt('Type "DELETE PIN" to confirm:');
      if (confirmText === 'DELETE PIN') {
        localStorage.removeItem(PIN_KEY);
        localStorage.removeItem(PIN_ENABLED_KEY);
        clearAttempts();
        lockSession();
        lockScreen.remove();
        alert('PIN removed! You can set a new PIN from dashboard.');
      }
    }
  };
}

function showPinSetup() {
  if (document.getElementById('pinSetupModal')) return;
  
  const modal = document.createElement('div');
  modal.id = 'pinSetupModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:999998;background:rgba(0,0,0,0.85);display:grid;place-items:center;padding:12px;font-family:Inter,sans-serif';
  modal.innerHTML = `
    <div style="width:100%;max-width:340px;background:#1a201c;border:1px solid #2a352e;border-radius:18px;padding:20px;text-align:center">
      <h3 id="pinSetupTitle" style="color:#e8efe9;font-size:18px;margin-bottom:6px">🔒 Setup PIN</h3>
      <p id="pinSetupDesc" style="color:#8da090;font-size:11px;margin-bottom:16px">Create a 4-digit PIN for app startup protection</p>
      
      <div style="display:flex;gap:10px;justify-content:center;margin-bottom:20px" id="setupDots">
        <div class="setup-dot" style="width:12px;height:12px;border-radius:50%;background:#1e2521;border:2px solid #242e27"></div>
        <div class="setup-dot" style="width:12px;height:12px;border-radius:50%;background:#1e2521;border:2px solid #242e27"></div>
        <div class="setup-dot" style="width:12px;height:12px;border-radius:50%;background:#1e2521;border:2px solid #242e27"></div>
        <div class="setup-dot" style="width:12px;height:12px;border-radius:50%;background:#1e2521;border:2px solid #242e27"></div>
      </div>
      
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
        <button class="setup-key" data-key="1">1</button>
        <button class="setup-key" data-key="2">2</button>
        <button class="setup-key" data-key="3">3</button>
        <button class="setup-key" data-key="4">4</button>
        <button class="setup-key" data-key="5">5</button>
        <button class="setup-key" data-key="6">6</button>
        <button class="setup-key" data-key="7">7</button>
        <button class="setup-key" data-key="8">8</button>
        <button class="setup-key" data-key="9">9</button>
        <button class="setup-key" data-key="clear" style="color:#8da090">⌫</button>
        <button class="setup-key" data-key="0">0</button>
        <button class="setup-key" data-key="enter" style="color:#1ed760">✓</button>
      </div>
      
      <div style="display:flex;gap:8px">
        <button id="cancelPinSetup" style="flex:1;background:#171c19;border:1px solid #242e27;color:#e8efe9;padding:10px;border-radius:10px;font-size:11px;font-weight:700">Cancel</button>
        <button id="clearPinSetup" style="flex:1;background:transparent;border:1px solid #ff4d4d;color:#ff4d4d;padding:10px;border-radius:10px;font-size:11px;font-weight:700;display:none">Disable PIN</button>
      </div>
      
      <style>
        .setup-key{height:56px;background:#171c19;border:1px solid #242e27;border-radius:14px;color:#e8efe9;font-size:20px;font-weight:700}
        .setup-key:active{background:#1e2521;transform:scale(0.95)}
        .setup-dot.filled{background:#1ed760 !important;border-color:#1ed760 !important}
      </style>
    </div>
  `;
  document.body.appendChild(modal);
  
  let firstPin = '';
  let currentPin = '';
  let step = 'first';
  
  const dots = modal.querySelectorAll('.setup-dot');
  const title = modal.querySelector('#pinSetupTitle');
  const desc = modal.querySelector('#pinSetupDesc');
  
  function updateDots() {
    dots.forEach((dot, idx) => {
      dot.classList.toggle('filled', idx < currentPin.length);
    });
  }
  
  function handleKey(key) {
    if (key === 'clear') {
      currentPin = currentPin.slice(0, -1);
    } else if (key === 'enter') {
      if (currentPin.length === 4) {
        if (step === 'first') {
          firstPin = currentPin;
          currentPin = '';
          step = 'confirm';
          title.textContent = '🔒 Confirm PIN';
          desc.textContent = 'Re-enter your 4-digit PIN';
          updateDots();
        } else {
          if (currentPin === firstPin) {
            localStorage.setItem(PIN_KEY, simpleHash(currentPin));
            localStorage.setItem(PIN_ENABLED_KEY, 'true');
            clearAttempts();
            unlockSession();
            modal.remove();
            alert('✅ PIN setup successful! Now app will lock only on startup and when closed.');
            startInactivityTimer();
            updatePinButton();
          } else {
            alert('PINs do not match! Try again.');
            firstPin = '';
            currentPin = '';
            step = 'first';
            title.textContent = '🔒 Setup PIN';
            desc.textContent = 'Create a 4-digit PIN for app startup protection';
            updateDots();
          }
        }
      }
      return;
    } else if (/[0-9]/.test(key) && currentPin.length < 4) {
      currentPin += key;
    }
    updateDots();
    if (currentPin.length === 4 && step === 'first') {
      setTimeout(() => {
        firstPin = currentPin;
        currentPin = '';
        step = 'confirm';
        title.textContent = '🔒 Confirm PIN';
        desc.textContent = 'Re-enter your 4-digit PIN';
        updateDots();
      }, 300);
    } else if (currentPin.length === 4 && step === 'confirm') {
      setTimeout(() => {
        if (currentPin === firstPin) {
          localStorage.setItem(PIN_KEY, simpleHash(currentPin));
          localStorage.setItem(PIN_ENABLED_KEY, 'true');
          clearAttempts();
          unlockSession();
          modal.remove();
          alert('✅ PIN setup successful! Now app will lock only on startup and when closed.');
          startInactivityTimer();
          updatePinButton();
        } else {
          alert('PINs do not match! Try again.');
          firstPin = '';
          currentPin = '';
          step = 'first';
          title.textContent = '🔒 Setup PIN';
          desc.textContent = 'Create a 4-digit PIN for app startup protection';
          updateDots();
        }
      }, 300);
    }
  }
  
  modal.querySelectorAll('.setup-key').forEach(btn => {
    btn.addEventListener('click', () => handleKey(btn.dataset.key));
  });
  
  modal.querySelector('#cancelPinSetup').onclick = () => modal.remove();
  
  if (isPinEnabled()) {
    const clearBtn = modal.querySelector('#clearPinSetup');
    clearBtn.style.display = 'block';
    clearBtn.onclick = () => {
      if (confirm('Disable PIN protection?')) {
        const current = prompt('Enter current PIN to disable:');
        if (current && simpleHash(current) === localStorage.getItem(PIN_KEY)) {
          localStorage.removeItem(PIN_KEY);
          localStorage.removeItem(PIN_ENABLED_KEY);
          clearAttempts();
          lockSession();
          alert('PIN disabled!');
          modal.remove();
          updatePinButton();
        } else {
          alert('Wrong PIN!');
        }
      }
    };
  }
  
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

let inactivityTimer = null;

function startInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    if (isPinEnabled() && isSessionUnlocked()) {
      lockSession();
      createPinUI();
    }
  }, AUTO_LOCK_MINUTES * 60 * 1000);
}

function resetInactivityTimer() {
  const now = Date.now().toString();
  sessionStorage.setItem(SESSION_LAST_ACTIVE, now);
  localStorage.setItem(PIN_LAST_ACTIVE, now);
  if (isPinEnabled() && isSessionUnlocked()) {
    startInactivityTimer();
  }
}

function updatePinButton() {
  const btn = document.getElementById('pinSettingsBtn');
  if (btn) {
    btn.textContent = isPinEnabled() ? '🔒 PIN ON' : '🔓 PIN OFF';
  }
}

// Handle app close / tab close / PWA close -> Auto lock
window.addEventListener('pagehide', () => {
  // When user closes app/tab, clear session unlock so next startup asks PIN
  // Actually sessionStorage auto clears on tab close, but for PWA we explicitly lock
  if (isPinEnabled()) {
    // Don't clear immediately on pagehide for navigation, 
    // sessionStorage will persist for same tab navigation
    // But we set a flag that this was a close
    localStorage.setItem('fintrack_was_closed', 'true');
  }
});

window.addEventListener('beforeunload', () => {
  // For PWA, when app is closed, session will be cleared automatically
  // This ensures next launch requires PIN
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // App goes to background
    localStorage.setItem('fintrack_background_time', Date.now().toString());
  } else {
    // App comes to foreground
    const bgTime = parseInt(localStorage.getItem('fintrack_background_time') || '0');
    if (bgTime) {
      const diffMinutes = (Date.now() - bgTime) / (1000 * 60);
      // If app was in background for more than 2 minutes, lock it
      if (diffMinutes > AUTO_LOCK_MINUTES && isPinEnabled() && isSessionUnlocked()) {
        lockSession();
        createPinUI();
      }
    }
    resetInactivityTimer();
  }
});

function initPinAuth() {
  // Only show PIN on startup if session not unlocked
  if (isPinEnabled() && !isSessionUnlocked()) {
    setTimeout(() => createPinUI(), 600);
  } else if (isPinEnabled() && isSessionUnlocked()) {
    // Already unlocked in this session, just start timer
    startInactivityTimer();
  }
  
  // Activity listeners - update last active time but DON'T lock on every page change
  ['click', 'keydown', 'touchstart'].forEach(event => {
    document.addEventListener(event, resetInactivityTimer, { passive: true });
  });
  
  window.setupPin = showPinSetup;
  window.disablePin = () => { showPinSetup(); };
  window.isPinEnabled = isPinEnabled;
  window.lockApp = () => {
    if (isPinEnabled()) {
      lockSession();
      createPinUI();
    }
  };
  window.unlockSession = unlockSession;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPinAuth);
} else {
  initPinAuth();
}

setTimeout(() => {
  const statusBar = document.getElementById('statusText');
  if (statusBar && !document.getElementById('pinSettingsBtn')) {
    const pinBtn = document.createElement('button');
    pinBtn.id = 'pinSettingsBtn';
    pinBtn.style.cssText = 'margin-left:auto;background:transparent;border:1px solid #242e27;color:#8da090;padding:4px 8px;border-radius:8px;font-size:10px;cursor:pointer';
    pinBtn.textContent = isPinEnabled() ? '🔒 PIN ON' : '🔓 PIN OFF';
    pinBtn.onclick = () => showPinSetup();
    statusBar.parentElement.appendChild(pinBtn);
  }
}, 1200);
