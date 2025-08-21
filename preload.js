const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {

  windowControl: (action) => ipcRenderer.send('window-control', action),
  

  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.send('save-settings', settings),
  onSettingsSaved: (callback) => ipcRenderer.on('settings-saved', (_, value) => callback(value)),
  setZoomLevel: (zoomLevel) => ipcRenderer.send('set-zoom-level', zoomLevel),
  

  onLoadingChange: (callback) => ipcRenderer.on('loading', (_, isLoading) => callback(isLoading)),
  

  onOpenSettings: (callback) => ipcRenderer.on('open-settings', () => callback()),
  

  onFullscreenChange: (callback) => ipcRenderer.on('fullscreen-change', (_, isFullscreen) => callback(isFullscreen)),
  

  onVideoFullscreenChange: (callback) => ipcRenderer.on('video-fullscreen-change', (_, isVideoFullscreen) => callback(isVideoFullscreen)),
  

  togglePictureInPicture: (url, hasVideo, videoElement, currentTime, videoId) => ipcRenderer.send('toggle-pip-mode', url, hasVideo, videoElement, currentTime, videoId),
  onPipModeChange: (callback) => ipcRenderer.on('pip-mode-change', (_, isPipActive) => callback(isPipActive)),
  getCurrentUrl: () => ipcRenderer.invoke('get-current-url'),
  updateCurrentUrl: (url) => ipcRenderer.send('update-current-url', url),
  closePipWindow: () => ipcRenderer.send('close-pip-window'),
  onPipError: (callback) => ipcRenderer.on('pip-error', (_, errorMessage) => callback(errorMessage)),
  

  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  downloadUpdate: () => ipcRenderer.send('download-update'),
  installUpdate: () => ipcRenderer.send('install-update'),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_, status) => callback(status)),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_, info) => callback(info)),
  

  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  

  clearCache: () => ipcRenderer.invoke('clear-cache'),
  onCacheCleared: (callback) => ipcRenderer.on('cache-cleared', (_, result) => callback(result)),
  

  setDiscordWatching: (data) => ipcRenderer.send('discord-set-watching', data),
  setDiscordSearching: () => ipcRenderer.send('discord-set-searching'),
  setDiscordBrowsing: (pageTitle) => ipcRenderer.send('discord-set-browsing', pageTitle),
});


window.addEventListener('DOMContentLoaded', () => {

  const style = document.createElement('style');
  style.textContent = `
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    
    ::-webkit-scrollbar-thumb {
      background: rgba(33, 150, 243, 0.5);
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(33, 150, 243, 0.8);
    }
    
    ::-webkit-scrollbar-corner {
      background: transparent;
    }
  `;
  document.head.appendChild(style);
  

  const script = document.createElement('script');
  script.textContent = `
   
    const originalWindowOpen = window.open;
    
    window.open = function(url, target, features) {
      if (url) {
       
        const currentDomain = window.location.hostname;
        const urlObj = new URL(url, window.location.href);
        
        if (urlObj.hostname === currentDomain || urlObj.hostname === 'animelook.net' || urlObj.hostname.endsWith('.animelook.net')) {
          if (target === '_blank') {
            return originalWindowOpen(url, '_self', features);
          } else {
            window.location.href = url;
            return null;
          }
        } else {
          window.parent.postMessage({ type: 'redirect-to-homepage' }, '*');
          return null;
        }
      }

      return {
        closed: true,
        close: function() {},
        focus: function() {},
        blur: function() {}
      };
    };
    
    
    document.addEventListener('click', function(e) {
      const link = e.target.closest('a');
      if (link && link.target === '_blank') {
        e.preventDefault();
        const url = link.href;
        const urlObj = new URL(url, window.location.href);
        
        if (urlObj.hostname === 'animelook.net' || urlObj.hostname.endsWith('.animelook.net')) {
          window.open(link.href, '_self');
        } else {
          window.parent.postMessage({ type: 'redirect-to-homepage' }, '*');
        }
      }
    }, true);
    
   
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (link && link.href) {
        const url = link.href;
        const currentDomain = window.location.hostname;
        const urlObj = new URL(url, window.location.href);
        
        if (urlObj.hostname === currentDomain || 
            urlObj.hostname === 'animelook.net' || 
            urlObj.hostname.endsWith('.animelook.net')) {
          if (link.target === '_blank') {
            e.preventDefault();
            window.location.href = url;
          }
        } else {
          e.preventDefault();
          window.parent.postMessage({ type: 'redirect-to-homepage' }, '*');
        }
      }
    }, true);
  `;
  document.head.appendChild(script);
  

  window.addEventListener('message', (event) => {

    if (event.data && event.data.type === 'video-fullscreen-change') {

      ipcRenderer.send('video-fullscreen-change', event.data.isFullscreen);
    }
    

    if (event.data && event.data.type === 'redirect-to-homepage') {

      ipcRenderer.send('redirect-to-homepage');
    }
    
    if (event.data && event.data.type === 'open-external-url') {
      ipcRenderer.send('redirect-to-homepage');
    }
  });
  
  document.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (link && link.href) {
        const url = link.href;
        try {
          const urlObj = new URL(url, window.location.href);
          if (urlObj.hostname === 'animelook.net' || urlObj.hostname.endsWith('.animelook.net')) {
            if (link.target === '_blank') {
              e.preventDefault();
              window.location.href = url;
            }
          } else {
            e.preventDefault();
            ipcRenderer.send('redirect-to-homepage');
          }
        } catch (error) {
          console.error('URL işleme hatası:', error);
        }
      }
    }, true);
});