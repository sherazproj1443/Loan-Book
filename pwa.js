
// PWA Install Prompt + Offline Sync + Google Drive Backup
let deferredPrompt=null;
let isOnline=navigator.onLine;

function initPWA(){
  // Register SW
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js').then(reg=>{
      console.log('SW registered', reg.scope);
      // Check for updates
      reg.addEventListener('updatefound', ()=>{
        const newWorker=reg.installing;
        newWorker.addEventListener('statechange', ()=>{
          if(newWorker.state==='installed' && navigator.serviceWorker.controller){
            showUpdateToast();
          }
        });
      });
    }).catch(err=>console.log('SW fail', err));

    navigator.serviceWorker.addEventListener('message', e=>{
      if(e.data && e.data.type==='SYNC_NOW'){
        if(window.syncPendingData) window.syncPendingData();
      }
    });
  }

  // Install prompt
  window.addEventListener('beforeinstallprompt', e=>{
    e.preventDefault();
    deferredPrompt=e;
    showInstallBanner();
  });

  window.addEventListener('appinstalled', ()=>{
    deferredPrompt=null;
    hideInstallBanner();
    console.log('PWA installed');
  });

  // Online/Offline handling
  window.addEventListener('online', ()=>{
    isOnline=true;
    updateOnlineStatus();
    if(window.syncPendingData) window.syncPendingData();
    if(window.checkWeeklyBackup) window.checkWeeklyBackup();
  });
  window.addEventListener('offline', ()=>{
    isOnline=false;
    updateOnlineStatus();
  });
  updateOnlineStatus();

  // Weekly backup check on load
  setTimeout(()=>{ if(window.checkWeeklyBackup) window.checkWeeklyBackup(); }, 3000);
}

function showInstallBanner(){
  const existing=document.getElementById('pwaInstallBanner');
  if(existing) return;
  const banner=document.createElement('div');
  banner.id='pwaInstallBanner';
  banner.style.cssText='position:fixed;bottom:12px;left:12px;right:12px;background:#1a201c;border:1px solid #2a352e;border-radius:14px;padding:12px;display:flex;align-items:center;gap:10px;z-index:9999;box-shadow:0 10px 30px rgba(0,0,0,0.5)';
  banner.innerHTML=`<div style="width:40px;height:40px;background:#0f1210;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px">📲</div><div style="flex:1"><b style="font-size:12px;display:block">Install FinTrack Pro</b><span style="font-size:10px;color:#8da090">Add to home screen for offline use</span></div><button onclick="installPWA()" style="background:#e8efe9;color:#000;border:none;padding:8px 14px;border-radius:8px;font-weight:700;font-size:11px">Install</button><button onclick="hideInstallBanner()" style="background:transparent;color:#8da090;border:1px solid #242e27;padding:6px 10px;border-radius:8px;font-size:11px">✕</button>`;
  document.body.appendChild(banner);
}

function hideInstallBanner(){
  const b=document.getElementById('pwaInstallBanner');
  if(b) b.remove();
}

window.installPWA=async()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  const choice=await deferredPrompt.userChoice;
  console.log('Install choice', choice.outcome);
  deferredPrompt=null;
  hideInstallBanner();
};

function showUpdateToast(){
  const t=document.createElement('div');
  t.style.cssText='position:fixed;top:12px;left:12px;right:12px;background:#ffb020;color:#000;padding:10px 14px;border-radius:10px;font-size:11px;font-weight:700;z-index:9999;text-align:center';
  t.innerHTML='New version available <button onclick="location.reload()" style="margin-left:8px;background:#000;color:#ffb020;border:none;padding:4px 10px;border-radius:6px;font-weight:700">Update</button>';
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 8000);
}

function updateOnlineStatus(){
  const el=document.getElementById('syncText') || document.getElementById('statusText');
  // We'll update statusText elsewhere, but add indicator
  const indicator=document.getElementById('offlineIndicator');
  if(!navigator.onLine){
    if(!indicator){
      const d=document.createElement('div');
      d.id='offlineIndicator';
      d.style.cssText='position:fixed;top:0;left:0;right:0;background:#ff4d4d;color:#fff;text-align:center;padding:4px;font-size:10px;font-weight:700;z-index:10000';
      d.textContent='⚠️ Offline Mode - Data will sync when online';
      document.body.prepend(d);
    }
  } else {
    if(indicator) indicator.remove();
  }
}

// Offline sync queue
window.saveDataWithQueue = async function(saveFn){
  // Always save locally first
  const localKey='loanbook_v2_full';
  // Mark as pending sync if offline
  if(!navigator.onLine){
    localStorage.setItem('fintrack_pending_sync','true');
    localStorage.setItem('fintrack_last_offline_save', new Date().toISOString());
  }
  return await saveFn();
};

window.syncPendingData = async function(){
  const pending=localStorage.getItem('fintrack_pending_sync');
  if(!pending) return;
  if(!navigator.onLine) return;
  console.log('Syncing pending data to JSONBin...');
  const statusEl=document.getElementById('statusText');
  if(statusEl) statusEl.textContent='Syncing offline changes...';
  try{
    const dataStr=localStorage.getItem('loanbook_v2_full');
    if(!dataStr) return;
    const data=JSON.parse(dataStr);
    // Get config
    const cfgStr=localStorage.getItem('jsonbin_config');
    let cfg=null;
    if(cfgStr) cfg=JSON.parse(cfgStr);
    else {
      // try import
      const {JSONBIN_CONFIG} = await import('./jsonbin-config.js');
      cfg=JSONBIN_CONFIG;
    }
    if(!cfg || cfg.BIN_ID==='YOUR_BIN_ID') return;
    const res=await fetch(cfg.API_URL+'/'+cfg.BIN_ID,{
      method:'PUT',
      headers:{'Content-Type':'application/json','X-Master-Key':cfg.API_KEY},
      body:JSON.stringify(data)
    });
    if(res.ok){
      localStorage.removeItem('fintrack_pending_sync');
      if(statusEl) statusEl.textContent='Synced • Online';
      console.log('Offline sync success');
    }
  }catch(e){
    console.error('Sync failed', e);
    if(statusEl) statusEl.textContent='Sync failed - will retry';
  }
};

// Google Drive Weekly Backup
window.checkWeeklyBackup=()=>{
  const lastBackup=localStorage.getItem('fintrack_last_drive_backup');
  const now=new Date();
  if(!lastBackup){
    // first time, set date and don't auto backup yet
    localStorage.setItem('fintrack_last_drive_backup', now.toISOString());
    return;
  }
  const last=new Date(lastBackup);
  const diffDays=(now-last)/(1000*60*60*24);
  if(diffDays>=7){
    console.log('Weekly backup due');
    // Show prompt
    const existing=document.getElementById('backupPrompt');
    if(!existing){
      const p=document.createElement('div');
      p.id='backupPrompt';
      p.style.cssText='position:fixed;bottom:70px;left:12px;right:12px;background:#1e2521;border:1px solid #2a352e;border-radius:12px;padding:10px;display:flex;align-items:center;gap:8px;z-index:9998';
      p.innerHTML=`<span style="font-size:12px">💾 Weekly backup due</span><button onclick="backupToDrive()" style="margin-left:auto;background:#4da3ff;color:#fff;border:none;padding:6px 12px;border-radius:8px;font-size:10px;font-weight:700">Backup to Drive</button><button onclick="this.parentElement.remove()" style="background:transparent;color:#8da090;border:none;font-size:12px">✕</button>`;
      document.body.appendChild(p);
    }
  }
};

window.backupToDrive=async()=>{
  try{
    const dataStr=localStorage.getItem('loanbook_v2_full');
    if(!dataStr){ alert('No data to backup'); return; }
    const data=JSON.parse(dataStr);
    const backup={
      timestamp:new Date().toISOString(),
      version:'3.0',
      data:data,
      stats:{
        loans:data.loans?.length||0,
        incomes:data.incomes?.length||0,
        expenses:data.expenses?.length||0
      }
    };
    // Create JSON file and download (user can manually upload to Drive) + try GDrive API if available
    const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`FinTrackPro_Backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    // If gapi is loaded, try Drive upload
    if(window.gapi && window.gapi.client && window.gapi.client.drive){
      await uploadToGDrive(blob);
    } else {
      // Show instructions for Drive
      alert('Backup file downloaded! Upload it to your Google Drive > FinTrackPro folder for safekeeping.\n\nFor auto backup, connect Google Drive in settings (coming soon with OAuth).');
    }

    localStorage.setItem('fintrack_last_drive_backup', new Date().toISOString());
    const prompt=document.getElementById('backupPrompt');
    if(prompt) prompt.remove();
    const statusEl=document.getElementById('statusText');
    if(statusEl) statusEl.textContent='Backup saved • '+new Date().toLocaleTimeString();
  }catch(e){
    console.error('Backup failed', e);
    alert('Backup failed: '+e.message);
  }
};

async function uploadToGDrive(blob){
  // Placeholder for future OAuth implementation
  console.log('GDrive upload would happen here with OAuth token');
  // Implementation would use gapi.client.drive.files.create
}

// Initialize on load
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded', initPWA);
} else {
  initPWA();
}