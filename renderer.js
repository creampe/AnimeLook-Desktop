
const webview = document.getElementById('webview');
const loadingScreen = document.getElementById('loading-screen');
const settingsModal = document.getElementById('settings-modal');
const customTitlebar = document.getElementById('custom-titlebar');
const miniVideoContainer = document.getElementById('mini-video-container');
const miniWebview = document.getElementById('mini-webview');


const minimizeButton = document.getElementById('minimize-button');
const maximizeButton = document.getElementById('maximize-button');
const closeButton = document.getElementById('close-button');


const backButton = document.getElementById('back-button');
const forwardButton = document.getElementById('forward-button');
const reloadButton = document.getElementById('reload-button');
const clearCacheButton = document.getElementById('clear-cache-button');
const pipButton = document.getElementById('pip-button');
const settingsButton = document.getElementById('settings-button');
const closePipButton = document.getElementById('close-pip-button');


const closeModalButton = document.querySelector('.close-modal');
const saveSettingsButton = document.getElementById('save-settings');
const cancelSettingsButton = document.getElementById('cancel-settings');
const startAtBootCheckbox = document.getElementById('start-at-boot');
const runInBackgroundCheckbox = document.getElementById('run-in-background');
const performanceModeRadios = document.getElementsByName('performance-mode');
const zoomInButton = document.getElementById('zoom-in');
const zoomOutButton = document.getElementById('zoom-out');
const zoomLevelDisplay = document.getElementById('zoom-level-display');

let currentZoomLevel = 100;


function toggleLoadingScreen(isLoading) {
  if (isLoading) {
    loadingScreen.classList.add('visible');
  } else {
    loadingScreen.classList.remove('visible');
  }
}


function toggleSettingsModal(show) {
  if (show) {
    settingsModal.classList.add('visible');
    loadCurrentSettings();
  } else {
    settingsModal.classList.remove('visible');
  }
}


async function loadCurrentSettings() {
  try {
    const settings = await window.electronAPI.getSettings();
    startAtBootCheckbox.checked = settings.startAtBoot;
    runInBackgroundCheckbox.checked = settings.runInBackground;
    currentZoomLevel = settings.zoomLevel || 100;
    zoomLevelDisplay.textContent = `${currentZoomLevel}%`;

    for (const radio of performanceModeRadios) {
      if (radio.value === settings.performanceMode) {
        radio.checked = true;
        break;
      }
    }
    
    const appInfo = await window.electronAPI.getAppInfo();
    document.getElementById('version-number').textContent = appInfo.version;
    document.getElementById('app-author').textContent = `Geliştirici: ${appInfo.author}`;
    document.getElementById('app-description').textContent = appInfo.description;
    
    if (appInfo.releaseNotes) {
      const releaseNotesElement = document.getElementById('release-notes');
      if (releaseNotesElement) {
        releaseNotesElement.innerHTML = formatReleaseNotes(appInfo.releaseNotes);
        releaseNotesElement.style.display = 'block';
      }
    }
  } catch (error) {
    console.error('Ayarlar yüklenirken hata oluştu:', error);
  }
}

function formatReleaseNotes(notes) {
  if (!notes) return '';
  
  try {
    return marked.parse(notes);
  } catch (error) {
    console.error('Markdown işleme hatası:', error);
    return notes
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}


function saveSettings() {

  let selectedPerformanceMode = 'balanced';
  for (const radio of performanceModeRadios) {
    if (radio.checked) {
      selectedPerformanceMode = radio.value;
      break;
    }
  }
  
  const settings = {
    startAtBoot: startAtBootCheckbox.checked,
    runInBackground: runInBackgroundCheckbox.checked,
    performanceMode: selectedPerformanceMode,
    zoomLevel: currentZoomLevel
  };
  
  window.electronAPI.saveSettings(settings);
  toggleSettingsModal(false);
}

function increaseZoom() {
  if (currentZoomLevel < 200) {
    currentZoomLevel += 10;
    updateZoomLevel();
  }
}

function decreaseZoom() {
  if (currentZoomLevel > 50) {
    currentZoomLevel -= 10;
    updateZoomLevel();
  }
}

function updateZoomLevel() {
  zoomLevelDisplay.textContent = `${currentZoomLevel}%`;
  window.electronAPI.setZoomLevel(currentZoomLevel);
}


function handleFullscreenChange(isFullscreen) {
  if (isFullscreen) {

    customTitlebar.style.display = 'none';

    toggleSettingsModal(false);

    checkForFullscreenVideo();
  } else {

    customTitlebar.style.display = 'flex';

    resetVideoPlayerControls();
  }
}


webview.addEventListener('did-start-loading', () => {
  toggleLoadingScreen(true);

  updateNavigationButtons();
});

webview.addEventListener('did-stop-loading', () => {
  toggleLoadingScreen(false);

  updateNavigationButtons();
});


function updateNavigationButtons() {
  if (webview) {
    backButton.disabled = !webview.canGoBack();
    forwardButton.disabled = !webview.canGoForward();
    

    if (!webview.canGoBack()) {
      backButton.classList.add('disabled');
    } else {
      backButton.classList.remove('disabled');
    }
    
    if (!webview.canGoForward()) {
      forwardButton.classList.add('disabled');
    } else {
      forwardButton.classList.remove('disabled');
    }
  }
}


webview.addEventListener('did-finish-load', () => {
  updateNavigationButtons();
  

  const currentUrl = webview.getURL();
  analyzeUrlAndUpdateDiscordRPC(currentUrl);

  webview.focus();
  
  webview.executeJavaScript(`
    (function() {
      const inputs = document.querySelectorAll('input[type="text"], input[type="search"], input:not([type])');
      if (inputs.length > 0) {
        inputs[0].focus();
        console.log('Webview ve input alanına otomatik focus verildi');
      } else {
        document.body.focus();
        console.log('Webview ve sayfaya otomatik focus verildi');
      }
      
      document.querySelectorAll('a').forEach(link => {
        if (link.hasAttribute('data-processed')) return;
        link.setAttribute('data-processed', 'true');
        
        link.addEventListener('click', (e) => {
          try {
            const url = link.href;
            const urlObj = new URL(url, window.location.href);
            
            if (urlObj.hostname === 'animelook.net' || urlObj.hostname.endsWith('.animelook.net')) {
              if (link.target === '_blank') {
                e.preventDefault();
                window.location.href = url;
                return false;
              }
            } else {
              e.preventDefault();
              e.stopPropagation();
              window.postMessage({ type: 'redirect-to-homepage' }, '*');
              return false;
            }
          } catch (error) {
            console.error('URL işleme hatası:', error);
          }
        });
      });
    })();
  `);

  webview.executeJavaScript(`
    document.addEventListener('fullscreenchange', () => {

      window.postMessage({ type: 'video-fullscreen-change', isFullscreen: !!document.fullscreenElement }, '*');
    });
    
    document.addEventListener('webkitfullscreenchange', () => {

      window.postMessage({ type: 'video-fullscreen-change', isFullscreen: !!document.webkitFullscreenElement }, '*');
    });
    
    const originalWindowOpen = window.open;
    window.open = function(url, target, features) {
      if (url) {
        try {
          const urlObj = new URL(url, window.location.href);
          if (urlObj.hostname === 'animelook.net' || urlObj.hostname.endsWith('.animelook.net')) {
            if (target === '_blank') {
              return originalWindowOpen(url, '_self', features);
            } else {
              window.location.href = url;
            }
          } else {
            window.postMessage({ type: 'redirect-to-homepage' }, '*');
          }
        } catch (error) {
          console.error('URL işleme hatası:', error);
          window.postMessage({ type: 'redirect-to-homepage' }, '*');
        }
        return null;
      }
      return null;
    };

    document.querySelectorAll('a[target="_blank"]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const url = link.getAttribute('href');
        const urlObj = new URL(url, window.location.href);
        
        if (urlObj.hostname === 'animelook.net' || urlObj.hostname.endsWith('.animelook.net')) {
          window.location.href = url;
        } else {
          window.postMessage({ type: 'redirect-to-homepage' }, '*');
        }
      });
    });}
    
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (link && link.href && !link.hasAttribute('data-processed')) {
        link.setAttribute('data-processed', 'true');
        
        const url = link.href;
        const urlObj = new URL(url, window.location.href);
        
        if (urlObj.hostname === 'animelook.net' || urlObj.hostname.endsWith('.animelook.net')) {
          if (link.target === '_blank') {
            e.preventDefault();
            window.location.href = url;
          }
        } else {
          e.preventDefault();
          window.postMessage({ type: 'redirect-to-homepage' }, '*');
        }
      }
    }, true);
  `);
  
  webview.insertCSS(`
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
    
    iframe::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    
    iframe::-webkit-scrollbar-track {
      background: transparent;
    }
    
    iframe::-webkit-scrollbar-thumb {
      background: rgba(33, 150, 243, 0.5);
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    iframe::-webkit-scrollbar-thumb:hover {
      background: rgba(33, 150, 243, 0.8);
    }
    
    iframe::-webkit-scrollbar-corner {
      background: transparent;
    }
  `);

  webview.addEventListener('ipc-message', (event) => {
    if (event.channel === 'video-fullscreen-change') {
      const isVideoFullscreen = event.args[0];
      if (isVideoFullscreen) {
        checkForFullscreenVideo();
      } else {
        resetVideoPlayerControls();
      }
    }
  });
});

miniWebview.addEventListener('did-finish-load', () => {
  miniWebview.executeJavaScript(`
    document.addEventListener('fullscreenchange', () => {
      window.postMessage({ type: 'video-fullscreen-change', isFullscreen: !!document.fullscreenElement }, '*');
    });
    
    document.addEventListener('webkitfullscreenchange', () => {
      window.postMessage({ type: 'video-fullscreen-change', isFullscreen: !!document.webkitFullscreenElement }, '*');
    });
  `);
  
  miniWebview.insertCSS(`
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
    
    iframe::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    
    iframe::-webkit-scrollbar-track {
      background: transparent;
    }
    
    iframe::-webkit-scrollbar-thumb {
      background: rgba(33, 150, 243, 0.5);
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    iframe::-webkit-scrollbar-thumb:hover {
      background: rgba(33, 150, 243, 0.8);
    }
    
    iframe::-webkit-scrollbar-corner {
      background: transparent;
    }
  `);
});


minimizeButton.addEventListener('click', () => {
  window.electronAPI.windowControl('minimize');
});

maximizeButton.addEventListener('click', () => {
  window.electronAPI.windowControl('maximize');
});

closeButton.addEventListener('click', () => {
  window.electronAPI.windowControl('close');
});


window.electronAPI.onFullscreenChange(handleFullscreenChange);


window.electronAPI.onVideoFullscreenChange((isVideoFullscreen) => {
  if (isVideoFullscreen) {
    checkForFullscreenVideo();
  } else {
    resetVideoPlayerControls();
  }
});

window.addEventListener('focus', () => {
  webview.focus();
  
  webview.executeJavaScript(`
    (function() {
      const inputs = document.querySelectorAll('input[type="text"], input[type="search"], input:not([type])');
      if (inputs.length > 0) {
        inputs[0].focus();
        console.log('Pencere odaklandığında webview ve input alanına focus verildi');
      } else {
        document.body.focus();
        console.log('Pencere odaklandığında webview ve sayfaya focus verildi');
      }
    })();
  `);
});


backButton.addEventListener('click', () => {
  if (webview.canGoBack()) {
    webview.goBack();
  }
});

forwardButton.addEventListener('click', () => {
  if (webview.canGoForward()) {
    webview.goForward();
  }
});

reloadButton.addEventListener('click', () => {
  webview.reload();
});


const notificationSystem = document.getElementById('notification-system');
const notificationBox = document.getElementById('notification-box');
const notificationTitle = document.querySelector('.notification-title');
const notificationMessage = document.querySelector('.notification-message');
const notificationConfirmBtn = document.getElementById('notification-confirm-btn');
const notificationCancelBtn = document.getElementById('notification-cancel-btn');
const notificationCloseBtn = document.getElementById('notification-close-btn');

const infoIcon = document.getElementById('notification-info-icon');
const successIcon = document.getElementById('notification-success-icon');
const warningIcon = document.getElementById('notification-warning-icon');
const errorIcon = document.getElementById('notification-error-icon');

const NOTIFICATION_TYPES = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error'
};

function showNotification(title, message, type = NOTIFICATION_TYPES.INFO, hasCancel = false) {
  return new Promise((resolve) => {
    infoIcon.style.display = 'none';
    successIcon.style.display = 'none';
    warningIcon.style.display = 'none';
    errorIcon.style.display = 'none';
    
    switch(type) {
      case NOTIFICATION_TYPES.SUCCESS:
        successIcon.style.display = 'block';
        break;
      case NOTIFICATION_TYPES.WARNING:
        warningIcon.style.display = 'block';
        break;
      case NOTIFICATION_TYPES.ERROR:
        errorIcon.style.display = 'block';
        break;
      default:
        infoIcon.style.display = 'block';
        break;
    }
    
    notificationTitle.textContent = title;
    notificationMessage.textContent = message;
    
    notificationCancelBtn.style.display = hasCancel ? 'block' : 'none';
    
    notificationSystem.classList.add('visible');
    
    const confirmHandler = () => {
      notificationSystem.classList.remove('visible');
      notificationConfirmBtn.removeEventListener('click', confirmHandler);
      notificationCancelBtn.removeEventListener('click', cancelHandler);
      notificationCloseBtn.removeEventListener('click', cancelHandler);
      resolve(true);
    };
    
    const cancelHandler = () => {
      notificationSystem.classList.remove('visible');
      notificationConfirmBtn.removeEventListener('click', confirmHandler);
      notificationCancelBtn.removeEventListener('click', cancelHandler);
      notificationCloseBtn.removeEventListener('click', cancelHandler);
      resolve(false);
    };
    
    notificationConfirmBtn.addEventListener('click', confirmHandler);
    notificationCancelBtn.addEventListener('click', cancelHandler);
    notificationCloseBtn.addEventListener('click', cancelHandler);
  });
}

async function showAlert(message, title = 'Bilgi') {
  return showNotification(title, message, NOTIFICATION_TYPES.INFO, false);
}

async function showConfirm(message, title = 'Onay') {
  return showNotification(title, message, NOTIFICATION_TYPES.WARNING, true);
}

async function showSuccess(message, title = 'Başarılı') {
  return showNotification(title, message, NOTIFICATION_TYPES.SUCCESS, false);
}

async function showError(message, title = 'Hata') {
  return showNotification(title, message, NOTIFICATION_TYPES.ERROR, false);
}

clearCacheButton.addEventListener('click', async () => {
  const confirmed = await showConfirm('Önbellek temizlenecek. Bu işlem uygulamanın performansını geçici olarak etkileyebilir. Devam etmek istiyor musunuz?', 'Önbellek Temizleme');
  
  if (confirmed) {
    try {
      toggleLoadingScreen(true);
      
      try {
        await webview.executeJavaScript(`
          if (window.caches) {
            caches.keys().then(cacheNames => {
              cacheNames.forEach(cacheName => {
                caches.delete(cacheName);
                console.log('Cache silindi:', cacheName);
              });
            });
          }
          
          try {
            localStorage.clear();
            sessionStorage.clear();
            console.log('Storage temizlendi');
          } catch (e) {
            console.error('Storage temizleme hatası:', e);
          }
          
          if (navigator.serviceWorker) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
              registrations.forEach(registration => {
                registration.unregister();
                console.log('Service worker kaydı silindi');
              });
            });
          }
        `);
        console.log('Webview içi önbellek temizleme işlemi başarılı');
      } catch (webviewError) {
        console.error('Webview önbellek temizleme hatası:', webviewError);
      }
      
      const result = await window.electronAPI.clearCache();
      
      toggleLoadingScreen(false);
      
      if (result.success) {
        await showSuccess(`${result.deletedFiles} dosya silindi.`, 'Önbellek Başarıyla Temizlendi');
        webview.reload();
      } else {
        await showError((result.error || 'Bilinmeyen hata'), 'Önbellek Temizleme Hatası');
      }
    } catch (error) {
      toggleLoadingScreen(false);
      await showError(error.message, 'Önbellek Temizleme Hatası');
      console.error('Önbellek temizleme hatası:', error);
    }
  }
});


pipButton.addEventListener('click', async () => {

  const videoInfo = await checkForVideoContent();
  if (videoInfo.hasVideo) {

    let videoUrl = videoInfo.videoSrc;
    

    if (!videoUrl) {
      videoUrl = await window.electronAPI.getCurrentUrl();
    }
    
   
    if (videoInfo.videoElement === 'video') {
      await webview.executeJavaScript(`
        (function() {
          const videos = document.querySelectorAll('video');
          if (videos.length > 0) {
            
            const isPlaying = !!(videos[0].currentTime > 0 && !videos[0].paused && !videos[0].ended && videos[0].readyState > 2);
            console.log('Video durduruluyor. Oynatma durumu:', isPlaying, 'Konum:', videos[0].currentTime);
            
            
            try {
              videos[0].click();
              console.log('Video tıklandı');
              setTimeout(() => {
                if (!videos[0].paused) {
                  videos[0].pause();
                  console.log('Video pause() metodu ile durduruldu');
                }
              }, 100);
            } catch (e) {
              console.error('Video tıklama hatası:', e);
              if (!videos[0].paused) {
                videos[0].pause();
              }
            }
            return true;
          }
          return false;
        })();
      `);
    }

    window.electronAPI.togglePictureInPicture(
      videoUrl, 
      videoInfo.hasVideo, 
      videoInfo.videoElement, 
      videoInfo.currentTime, 
      videoInfo.videoId
    );

    console.log('Video penceresi açıldı. Ana uygulama gizlendi. Video konumu:', videoInfo.currentTime);
  } else {
    showError('Bu sayfada video bulunamadı!', 'Video Bulunamadı');
  }
});


window.electronAPI.onPipModeChange((isPipActive) => {
  if (isPipActive) {

    pipButton.classList.add('active');
  } else {

    pipButton.classList.remove('active');
  }
});


window.electronAPI.onPipError((errorMessage) => {
  showError(errorMessage, 'PiP Modu Hatası');
});


closePipButton.addEventListener('click', () => {
  window.electronAPI.closePipWindow();

  pipButton.classList.remove('active');
});


async function checkForVideoContent() {
  try {

    const result = await webview.executeJavaScript(`
      (function() {
       
        const mediaSelectors = {
    
          videos: 'video',
          
    
          iframes: 'iframe',
          
         
          players: '.video-js, .jw-video, .plyr, .video-container, .player-container, .html5-video-player, .vjs-tech, .mejs__mediaelement',
          
     
          animePlayers: '.anime-video, .episode-video, .video-frame, .episode-player, .player-embed',
          
         
          genericPlayers: '[class*="player"], [id*="player"], [class*="video"], [id*="video"]'
        };
        
      
        const videos = document.querySelectorAll(mediaSelectors.videos);
        if (videos.length > 0) {
         
          console.log('Video elementi bulundu');
          return { 
            hasVideo: true, 
            videoElement: 'video', 
            videoSrc: videos[0].src || '',
            currentTime: videos[0].currentTime || 0,
            duration: videos[0].duration || 0,
            videoId: 'video-' + Math.random().toString(36).substr(2, 9)
          };
        }
        
       
        const iframes = document.querySelectorAll(mediaSelectors.iframes);
        if (iframes.length > 0) {
         
          console.log('iframe elementi bulundu');
          return { 
            hasVideo: true, 
            videoElement: 'iframe', 
            videoSrc: iframes[0].src || '',
            currentTime: 0,
            duration: 0,
            videoId: 'iframe-' + Math.random().toString(36).substr(2, 9)
          };
        }
        
       
        const videoPlayers = document.querySelectorAll(mediaSelectors.players);
        if (videoPlayers.length > 0) {
          console.log('Video player elementi bulundu');

          const playerIframe = videoPlayers[0].querySelector('iframe');
          if (playerIframe) {
            return { 
              hasVideo: true, 
              videoElement: 'iframe', 
              videoSrc: playerIframe.src || '',
              currentTime: 0,
              duration: 0,
              videoId: 'player-iframe-' + Math.random().toString(36).substr(2, 9)
            };
          }

          const playerVideo = videoPlayers[0].querySelector('video');
          if (playerVideo) {
            return { 
              hasVideo: true, 
              videoElement: 'video', 
              videoSrc: playerVideo.src || '',
              currentTime: playerVideo.currentTime || 0,
              duration: playerVideo.duration || 0,
              videoId: 'player-video-' + Math.random().toString(36).substr(2, 9)
            };
          }
          return { 
            hasVideo: true, 
            videoElement: 'player', 
            videoSrc: '',
            currentTime: 0,
            duration: 0,
            videoId: 'player-' + Math.random().toString(36).substr(2, 9)
          };
        }
        

        const animelookPlayers = document.querySelectorAll(mediaSelectors.animePlayers);
        if (animelookPlayers.length > 0) {
          console.log('Anime player elementi bulundu');

          const animelookIframe = animelookPlayers[0].querySelector('iframe');
          if (animelookIframe) {
            return { 
              hasVideo: true, 
              videoElement: 'iframe', 
              videoSrc: animelookIframe.src || '',
              currentTime: 0,
              duration: 0,
              videoId: 'anime-iframe-' + Math.random().toString(36).substr(2, 9)
            };
          }

          const animelookVideo = animelookPlayers[0].querySelector('video');
          if (animelookVideo) {
            return { 
              hasVideo: true, 
              videoElement: 'video', 
              videoSrc: animelookVideo.src || '',
              currentTime: animelookVideo.currentTime || 0,
              duration: animelookVideo.duration || 0,
              videoId: 'anime-video-' + Math.random().toString(36).substr(2, 9)
            };
          }
          return { 
            hasVideo: true, 
            videoElement: 'player', 
            videoSrc: '',
            currentTime: 0,
            duration: 0,
            videoId: 'anime-player-' + Math.random().toString(36).substr(2, 9)
          };
        }
        

        const genericPlayers = document.querySelectorAll(mediaSelectors.genericPlayers);
        if (genericPlayers.length > 0) {
          console.log('Genel video container elementi bulundu');

          const genericIframe = genericPlayers[0].querySelector('iframe');
          if (genericIframe) {
            return { 
              hasVideo: true, 
              videoElement: 'iframe', 
              videoSrc: genericIframe.src || '',
              currentTime: 0,
              duration: 0,
              videoId: 'generic-iframe-' + Math.random().toString(36).substr(2, 9)
            };
          }
          const genericVideo = genericPlayers[0].querySelector('video');
          if (genericVideo) {
            return { 
              hasVideo: true, 
              videoElement: 'video', 
              videoSrc: genericVideo.src || '',
              currentTime: genericVideo.currentTime || 0,
              duration: genericVideo.duration || 0,
              videoId: 'generic-video-' + Math.random().toString(36).substr(2, 9)
            };
          }
          return { 
            hasVideo: true, 
            videoElement: 'player', 
            videoSrc: '',
            currentTime: 0,
            duration: 0,
            videoId: 'generic-player-' + Math.random().toString(36).substr(2, 9)
          };
        }
        
        console.log('Hiçbir video içeriği bulunamadı');
        return { hasVideo: false, videoElement: null, videoSrc: '', currentTime: 0, duration: 0, videoId: null };
      })();
    `);
    
    return result;
  } catch (error) {
    console.error('Video içeriği kontrol edilirken hata oluştu:', error);
    return { hasVideo: false, videoElement: null, videoSrc: '', currentTime: 0, duration: 0, videoId: null };
  }
}


closePipButton.addEventListener('click', () => {
  window.electronAPI.closePipWindow();
  pipButton.classList.remove('active');
});

settingsButton.addEventListener('click', () => {
  toggleSettingsModal(true);
});


closeModalButton.addEventListener('click', () => {
  toggleSettingsModal(false);
});

saveSettingsButton.addEventListener('click', saveSettings);

cancelSettingsButton.addEventListener('click', () => {
  toggleSettingsModal(false);
});

if (zoomInButton) {
  zoomInButton.addEventListener('click', increaseZoom);
}

if (zoomOutButton) {
  zoomOutButton.addEventListener('click', decreaseZoom);
}


settingsModal.addEventListener('click', (event) => {
  if (event.target === settingsModal) {
    toggleSettingsModal(false);
  }
});


window.electronAPI.onSettingsSaved((success) => {
  if (success) {
    console.log('Ayarlar başarıyla kaydedildi');
  }
});


window.electronAPI.onLoadingChange(toggleLoadingScreen);


window.electronAPI.onOpenSettings(() => {
  toggleSettingsModal(true);
});


toggleLoadingScreen(true);


webview.addEventListener('dom-ready', () => {
  updateNavigationButtons();
});


webview.addEventListener('did-navigate', () => {
  updateNavigationButtons();
  const currentUrl = webview.getURL();
  window.electronAPI.updateCurrentUrl(currentUrl);
  
  analyzeUrlAndUpdateDiscordRPC(currentUrl);
});

webview.addEventListener('did-navigate-in-page', () => {
  updateNavigationButtons();
  const currentUrl = webview.getURL();
  window.electronAPI.updateCurrentUrl(currentUrl);
  
  analyzeUrlAndUpdateDiscordRPC(currentUrl);
});


async function analyzeUrlAndUpdateDiscordRPC(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const searchParams = urlObj.searchParams;
    const pageTitle = await webview.executeJavaScript('document.title');
    
    if (pathname === '/' && !searchParams.has('s')) {
      window.electronAPI.setDiscordBrowsing('Ana Sayfa');
      return;
    }
    
    if (pathname === '/' && searchParams.has('s')) {
      const searchQuery = searchParams.get('s');
      window.electronAPI.setDiscordSearching();
      webview.executeJavaScript(`
        (function() {
          return {
            searchQuery: "${searchQuery.replace(/"/g, '\\"')}",
            resultCount: document.querySelectorAll('.anime-card, .search-result').length || 'bilinmiyor'
          };
        })()
      `).then(result => {
        if (result) {
          console.log('Arama sonuçları:', result);
        }
      }).catch(err => console.error('Arama bilgisi alınamadı:', err));
      return;
    }
    
    if (pathname.startsWith('/anime/')) {
      const animeSlug = pathname.split('/').filter(Boolean)[1]; 
      
      webview.executeJavaScript(`
        (function() {
          const animeTitle = document.querySelector('.anime-title, h1')?.textContent || document.title;
          const animeInfo = document.querySelector('.anime-info, .anime-description')?.textContent || 'Anime detayları';
          return { animeTitle, animeInfo };
        })()
      `).then(result => {
        if (result) {
          window.electronAPI.setDiscordBrowsing(`${result.animeTitle} hakkında bilgi alıyor`);
        }
      }).catch(err => console.error('Anime detay bilgisi alınamadı:', err));
      return;
    }
    
    const isWatchPage = pathname.includes('-izle/') || pathname.includes('/watch/') || pathname.includes('/bolum-');
    
    if (isWatchPage) {
      
      if (pageTitle) {

        let watchInfo = pageTitle;

        if (watchInfo.includes('|')) {
          watchInfo = watchInfo.split('|')[0].trim();
        }

        if (watchInfo.includes('izle')) {
          watchInfo = watchInfo.replace('izle', 'izliyor').trim();
        } else {
          watchInfo = watchInfo + ' izliyor';
        }
        
        if (watchInfo.length > 128) {
          watchInfo = watchInfo.substring(0, 125) + '...';
        }
        
        console.log('Discord RPC için hazırlanan bilgi:', watchInfo);
        window.electronAPI.setDiscordWatching({ animeTitle: watchInfo });
        return;
      }
      
      const pathParts = pathname.split('/');
      if (pathParts.length > 1) {
        const animePart = pathParts[1].replace(/-/g, ' ');
        let animeTitle = animePart.charAt(0).toUpperCase() + animePart.slice(1);
        
        if (animeTitle.length > 50) {
          animeTitle = animeTitle.substring(0, 47) + '...';
        }
        
        console.log('Discord RPC için URL\'den hazırlanan bilgi:', animeTitle + ' izliyor');
        window.electronAPI.setDiscordWatching({ animeTitle: animeTitle + ' izliyor' });
      } else {
        window.electronAPI.setDiscordWatching({ animeTitle: 'Anime izliyor' });
      }
      return;
    }
    
    window.electronAPI.setDiscordBrowsing(pageTitle);
    
  } catch (error) {
    console.error('Discord RPC güncellenirken hata oluştu:', error);
    webview.executeJavaScript('document.title').then(title => {
      window.electronAPI.setDiscordBrowsing(title);
    });
  }
}

function checkForFullscreenVideo() {

  webview.executeJavaScript(`
    (function() {

      const videos = document.querySelectorAll('video');
      let hasFullscreenVideo = false;
      

      videos.forEach(video => {

        if (video.webkitDisplayingFullscreen || 
            document.fullscreenElement === video || 
            document.webkitFullscreenElement === video) {
          hasFullscreenVideo = true;
          

          const videoControls = video.closest('.video-js');
          if (videoControls) {

            videoControls.style.zIndex = '9999';

            const controlBar = videoControls.querySelector('.vjs-control-bar');
            if (controlBar) {
              controlBar.style.bottom = '48px';
              controlBar.style.position = 'fixed';
            }
          }
        }
      });
      
      return hasFullscreenVideo;
    })();
  `).then(hasFullscreenVideo => {
    if (hasFullscreenVideo) {
      console.log('Tam ekran video algılandı, kontroller düzenlendi');
    }
  }).catch(err => {
    console.error('Video algılama hatası:', err);
  });
}


function resetVideoPlayerControls() {
  webview.executeJavaScript(`
    (function() {

      const videos = document.querySelectorAll('video');
      

      videos.forEach(video => {

        const videoControls = video.closest('.video-js');
        if (videoControls) {
          videoControls.style.zIndex = '';
          const controlBar = videoControls.querySelector('.vjs-control-bar');
          if (controlBar) {
            controlBar.style.bottom = '';
            controlBar.style.position = '';
          }
        }
      });
    })();
  `).catch(err => {
    console.error('Video kontrolleri sıfırlama hatası:', err);
  });
}

const updateButton = document.getElementById('update-button');
const updateNotification = document.getElementById('update-notification');
const closeUpdateModal = document.getElementById('close-update-modal');
const updateMessage = document.getElementById('update-message');
const updateVersion = document.getElementById('update-version');
const updateNotes = document.getElementById('update-notes');
const updateProgress = document.getElementById('update-progress');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const checkUpdateButton = document.getElementById('check-update-button');
const downloadUpdateButton = document.getElementById('download-update-button');
const installUpdateButton = document.getElementById('install-update-button');

let hasUpdate = false;

function toggleUpdateNotification(show) {
  if (show) {
    updateNotification.classList.add('visible');
  } else {
    updateNotification.classList.remove('visible');
  }
}

function handleUpdateStatus(status) {
  console.log('Update status:', status);
  
  if (status.message) {
    updateMessage.textContent = status.message;
  }
  

  if (status.data && status.data.percent !== undefined) {
    updateProgress.style.display = 'block';
    const percent = Math.round(status.data.percent);
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `${percent}%`;
  }
  

  if (status.message === 'Güncelleme indirildi') {
    downloadUpdateButton.style.display = 'none';
    installUpdateButton.style.display = 'inline-block';
  }
}

function handleUpdateAvailable(info) {
  hasUpdate = true;
  updateButton.style.display = 'flex';
  

  updateVersion.textContent = `Sürüm: ${info.version}`;
  if (info.releaseNotes) {
    updateNotes.innerHTML = `<strong>Değişiklikler:</strong><br>${formatReleaseNotes(info.releaseNotes)}`;
  } else {
    updateNotes.textContent = '';
  }
  
  downloadUpdateButton.style.display = 'inline-block';
}

function formatReleaseNotes(notes) {
  if (!notes) return '';
  
  return notes
    .replace(/\r\n/g, '\n')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/### (.*?)\n/g, '<h3>$1</h3>')
    .replace(/## (.*?)\n/g, '<h2>$1</h2>')
    .replace(/# (.*?)\n/g, '<h1>$1</h1>');
}

updateButton.addEventListener('click', () => {
  toggleUpdateNotification(true);
});

closeUpdateModal.addEventListener('click', () => {
  toggleUpdateNotification(false);
});

checkUpdateButton.addEventListener('click', () => {
  updateMessage.textContent = 'Güncellemeler kontrol ediliyor...';
  window.electronAPI.checkForUpdates();
});

downloadUpdateButton.addEventListener('click', () => {
  updateProgress.style.display = 'block';
  progressBar.style.width = '0%';
  progressText.textContent = '0%';
  window.electronAPI.downloadUpdate();
});

installUpdateButton.addEventListener('click', () => {
  window.electronAPI.installUpdate();
});

window.electronAPI.onUpdateStatus(handleUpdateStatus);
window.electronAPI.onUpdateAvailable(handleUpdateAvailable);

updateNotification.addEventListener('click', (event) => {
  if (event.target === updateNotification) {
    toggleUpdateNotification(false);
  }
});
