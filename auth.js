
// FinTrack Pro - PIN Authentication
const PIN_KEY = 'fintrack_pin_hash';
const PIN_ENABLED_KEY = 'fintrack_pin_enabled';
const PIN_SALT = 'fintrack_salt_2026';
const PIN_ATTEMPTS_KEY = 'fintrack_pin_attempts';
const PIN_LOCKOUT_KEY = 'fintrack_pin_lockout';
const PIN_LAST_ACTIVE = 'fintrack_last_active';

let pinUnlocked = false;
let inactivityTimer = null;
const AUTO_LOCK_MINUTES = 2;

function simpleHash(pin) {
  // Simple hash with salt - not super secure but enough for local protection
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

function isLocked() {
  if (!isPinEnabled()) return false;
  if (pinUnlocked) return false;
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
    const lockoutDuration = attempts >= 10 ? 5 * 60 * 1000 : 60 * 1000; // 1 min after 5, 5 min after 10
    localStorage.setItem(PIN_LOCKOUT_KEY, (Date.now() + lockoutDuration).toString());
    return lockoutDuration;
  }
  return 0;
}

function clearAttempts() {
  localStorage.removeItem(PIN_ATTEMPTS_KEY);
  localStorage.removeItem(PIN_LOCKOUT_KEY);
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
      <span style="color:#242e27">•</span>
      <button id="pinBiometricBtn" style="background:transparent;border:none;color:#4da3ff;font-size:11px;display:none">Use Biometric</button>
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
  
  // PIN input logic
  let currentPin = '';
  const dots = lockScreen.querySelectorAll('.pin-dot');
  
  function updateDots() {
    dots.forEach((dot, idx) => {
      dot.classList.toggle('filled', idx < currentPin.length);
    });
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
      setTimeout(() => verifyPin(currentPin), 200);
    }
  }
  
  function verifyPin(pin) {
    const storedHash = localStorage.getItem(PIN_KEY);
    if (simpleHash(pin) === storedHash) {
      // Success
      clearAttempts();
      pinUnlocked = true;
      localStorage.setItem(PIN_LAST_ACTIVE, Date.now().toString());
      lockScreen.style.transition = 'opacity 0.3s';
      lockScreen.style.opacity = '0';
      setTimeout(() => {
        lockScreen.remove();
        startInactivityTimer();
      }, 300);
    } else {
      // Fail
      const lockoutDuration = recordFailedAttempt();
      dots.forEach(d => { d.classList.add('error'); setTimeout(() => d.classList.remove('error'), 500); });
      currentPin = '';
      updateDots();
      const msg = document.getElementById('pinLockMessage');
      const attempts = parseInt(localStorage.getItem(PIN_ATTEMPTS_KEY) || '0');
      if (lockoutDuration > 0) {
        const lockMsg = document.getElementById('pinLockoutMsg');
        lockMsg.style.display = 'block';
        lockMsg.textContent = `Locked for ${lockoutDuration/1000}s after ${attempts} failed attempts`;
      } else {
        msg.textContent = `Wrong PIN (${attempts}/5 attempts)`;
        msg.style.color = '#ff4d4d';
        setTimeout(() => { msg.textContent = 'Enter PIN to unlock'; msg.style.color = '#8da090'; }, 2000);
      }
    }
  }
  
  lockScreen.querySelectorAll('.pin-key').forEach(btn => {
    btn.addEventListener('click', () => handleKey(btn.dataset.key));
  });
  
  // Keyboard support
  document.addEventListener('keydown', function pinKeyHandler(e) {
    if (!document.getElementById('pinLockScreen')) {
      document.removeEventListener('keydown', pinKeyHandler);
      return;
    }
    if (/[0-9]/.test(e.key)) handleKey(e.key);
    else if (e.key === 'Backspace') handleKey('clear');
    else if (e.key === 'Enter') handleKey('enter');
  });
  
  // Forgot PIN
  document.getElementById('pinForgotBtn').addEventListener('click', () => {
    showForgotPinDialog();
  });
  
  // Check for biometric
  if (window.PublicKeyCredential) {
    // Could implement WebAuthn later
  }
}

function showForgotPinDialog() {
  const existing = document.getElementById('forgotPinModal');
  if (existing) existing.remove();
  
  const modal = document.createElement('div');
  modal.id = 'forgotPinModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:1000000;display:grid;place-items:center;padding:20px';
  modal.innerHTML = `
    <div style="background:#1a201c;border:1px solid #2a352e;border-radius:18px;padding:20px;width:100%;max-width:340px">
      <h3 style="color:#e8efe9;font-size:16px;margin-bottom:8px">🔓 Forgot PIN?</h3>
      <p style="color:#8da090;font-size:11px;margin-bottom:16px">To reset PIN, you need to verify your JSONBin credentials or clear app data. Your cloud data is safe on JSONBin.</p>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button id="resetPinWithBin" style="background:#e8efe9;color:#000;border:none;padding:10px;border-radius:10px;font-weight:700;font-size:12px">Reset with BIN ID & Key</button>
        <button id="clearAllData" style="background:#ff4d4d;color:#fff;border:none;padding:10px;border-radius:10px;font-weight:700;font-size:12px">Clear Local Data & Reset PIN</button>
        <button id="cancelForgot" style="background:transparent;border:1px solid #242e27;color:#8da090;padding:10px;border-radius:10px;font-weight:700;font-size:12px">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  modal.querySelector('#cancelForgot').onclick = () => modal.remove();
  modal.querySelector('#clearAllData').onclick = () => {
    if (confirm('Clear local PIN and data? Cloud data on JSONBin will remain. You will need to re-enter BIN_ID and API Key.')) {
      localStorage.removeItem(PIN_KEY);
      localStorage.removeItem(PIN_ENABLED_KEY);
      localStorage.removeItem(PIN_ATTEMPTS_KEY);
      localStorage.removeItem(PIN_LOCKOUT_KEY);
      alert('PIN reset! Reloading...');
      location.reload();
    }
  };
  modal.querySelector('#resetPinWithBin').onclick = () => {
    const binId = prompt('Enter your BIN_ID (from jsonbin-config.js):');
    const apiKey = prompt('Enter your X-Master-Key:');
    if (binId && apiKey) {
      // Verify by trying to fetch
      fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, { headers: { 'X-Master-Key': apiKey } })
        .then(r => {
          if (r.ok) {
            localStorage.removeItem(PIN_KEY);
            localStorage.removeItem(PIN_ENABLED_KEY);
            alert('Verified! PIN has been reset. You can set a new PIN after unlocking.');
            location.reload();
          } else {
            alert('Invalid BIN_ID or Key');
          }
        })
        .catch(() => alert('Verification failed - check internet'));
    }
  };
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

function showPinSetup() {
  const existing = document.getElementById('pinSetupModal');
  if (existing) existing.remove();
  
  const modal = document.createElement('div');
  modal.id = 'pinSetupModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:1000000;display:grid;place-items:center;padding:20px';
  modal.innerHTML = `
    <div style="background:#1a201c;border:1px solid #2a352e;border-radius:18px;padding:20px;width:100%;max-width:340px">
      <h3 style="color:#e8efe9;font-size:16px;margin-bottom:4px" id="pinSetupTitle">🔒 Setup PIN</h3>
      <p style="color:#8da090;font-size:11px;margin-bottom:16px" id="pinSetupDesc">Create a 4-digit PIN to protect your financial data</p>
      
      <div style="display:flex;gap:10px;justify-content:center;margin-bottom:16px" id="setupDots">
        <div class="setup-dot" style="width:12px;height:12px;border-radius:50%;background:#1e2521;border:2px solid #242e27"></div>
        <div class="setup-dot" style="width:12px;height:12px;border-radius:50%;background:#1e2521;border:2px solid #242e27"></div>
        <div class="setup-dot" style="width:12px;height:12px;border-radius:50%;background:#1e2521;border:2px solid #242e27"></div>
        <div class="setup-dot" style="width:12px;height:12px;border-radius:50%;background:#1e2521;border:2px solid #242e27"></div>
      </div>
      
      <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;margin-bottom:16px">
        <button class="setup-key" data-key="1">1</button>
        <button class="setup-key" data-key="2">2</button>
        <button class="setup-key" data-key="3">3</button>
        <button class="setup-key" data-key="4">4</button>
        <button class="setup-key" data-key="5">5</button>
        <button class="setup-key" data-key="6">6</button>
        <button class="setup-key" data-key="7">7</button>
        <button class="setup-key" data-key="8">8</button>
        <button class="setup-key" data-key="9">9</button>
        <button class="setup-key" data-key="clear" style="font-size:14px">⌫</button>
        <button class="setup-key" data-key="0">0</button>
        <button class="setup-key" data-key="enter" style="font-size:14px;color:#1ed760">✓</button>
      </div>
      
      <div style="display:flex;gap:8px">
        <button id="cancelPinSetup" style="flex:1;background:transparent;border:1px solid #242e27;color:#8da090;padding:10px;border-radius:10px;font-weight:700;font-size:12px">Cancel</button>
        <button id="clearPinSetup" style="flex:1;background:#ff4d4d;color:#fff;border:none;padding:10px;border-radius:10px;font-weight:700;font-size:12px;display:none">Clear PIN</button>
      </div>
      
      <style>
        .setup-key{height:56px;background:#121512;border:1px solid #242e27;border-radius:12px;color:#e8efe9;font-size:20px;font-weight:700;cursor:pointer}
        .setup-key:active{background:#1e2521;transform:scale(0.95)}
        .setup-dot.filled{background:#1ed760 !important;border-color:#1ed760 !important}
      </style>
    </div>
  `;
  document.body.appendChild(modal);
  
  let firstPin = '';
  let currentPin = '';
  let step = 'first'; // first, confirm
  
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
            // Save PIN
            localStorage.setItem(PIN_KEY, simpleHash(currentPin));
            localStorage.setItem(PIN_ENABLED_KEY, 'true');
            clearAttempts();
            pinUnlocked = true;
            modal.remove();
            alert('✅ PIN setup successful! Your data is now protected.');
            startInactivityTimer();
          } else {
            alert('PINs do not match! Try again.');
            firstPin = '';
            currentPin = '';
            step = 'first';
            title.textContent = '🔒 Setup PIN';
            desc.textContent = 'Create a 4-digit PIN to protect your financial data';
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
      // Auto move to confirm after small delay
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
          pinUnlocked = true;
          modal.remove();
          alert('✅ PIN setup successful! Your data is now protected.');
          startInactivityTimer();
        } else {
          alert('PINs do not match! Try again.');
          firstPin = '';
          currentPin = '';
          step = 'first';
          title.textContent = '🔒 Setup PIN';
          desc.textContent = 'Create a 4-digit PIN to protect your financial data';
          updateDots();
        }
      }, 300);
    }
  }
  
  modal.querySelectorAll('.setup-key').forEach(btn => {
    btn.addEventListener('click', () => handleKey(btn.dataset.key));
  });
  
  modal.querySelector('#cancelPinSetup').onclick = () => modal.remove();
  
  // If PIN already enabled, show clear option
  if (isPinEnabled()) {
    const clearBtn = modal.querySelector('#clearPinSetup');
    clearBtn.style.display = 'block';
    clearBtn.onclick = () => {
      if (confirm('Disable PIN protection? Your data will not be PIN protected.')) {
        const current = prompt('Enter current PIN to disable:');
        if (current && simpleHash(current) === localStorage.getItem(PIN_KEY)) {
          localStorage.removeItem(PIN_KEY);
          localStorage.removeItem(PIN_ENABLED_KEY);
          clearAttempts();
          alert('PIN disabled!');
          modal.remove();
        } else {
          alert('Wrong PIN!');
        }
      }
    };
  }
  
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

function startInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    if (isPinEnabled()) {
      pinUnlocked = false;
      createPinUI();
    }
  }, AUTO_LOCK_MINUTES * 60 * 1000);
}

function resetInactivityTimer() {
  localStorage.setItem(PIN_LAST_ACTIVE, Date.now().toString());
  if (isPinEnabled() && pinUnlocked) {
    startInactivityTimer();
  }
}

// Initialize PIN system
function initPinAuth() {
  // Check if PIN is enabled and not unlocked
  if (isPinEnabled() && !pinUnlocked) {
    // Small delay to let page load
    setTimeout(() => createPinUI(), 500);
  }
  
  // Activity listeners for auto-lock
  ['click', 'keydown', 'touchstart', 'mousemove'].forEach(event => {
    document.addEventListener(event, resetInactivityTimer, { passive: true });
  });
  
  // Expose global functions
  window.setupPin = showPinSetup;
  window.disablePin = () => {
    if (!isPinEnabled()) { alert('PIN is not enabled'); return; }
    showPinSetup();
  };
  window.isPinEnabled = isPinEnabled;
  window.lockApp = () => {
    if (isPinEnabled()) {
      pinUnlocked = false;
      createPinUI();
    }
  };
}

// Auto init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPinAuth);
} else {
  initPinAuth();
}

// Also inject PIN settings button into page if dashboard
setTimeout(() => {
  const container = document.querySelector('.container');
  if (container && !document.getElementById('pinSettingsBtn')) {
    // Find status bar and add PIN button
    const statusBar = document.getElementById('statusText');
    if (statusBar) {
      const pinBtn = document.createElement('button');
      pinBtn.id = 'pinSettingsBtn';
      pinBtn.style.cssText = 'margin-left:auto;background:transparent;border:1px solid #242e27;color:#8da090;padding:4px 8px;border-radius:8px;font-size:10px;cursor:pointer';
      pinBtn.textContent = isPinEnabled() ? '🔒 PIN ON' : '🔓 PIN OFF';
      pinBtn.onclick = () => showPinSetup();
      statusBar.parentElement.appendChild(pinBtn);
    }
  }
}, 1000);
