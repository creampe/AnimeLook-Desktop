const { app, BrowserWindow, shell, ipcMain, Menu, Tray, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const updater = require('./updater');
const discordRPC = require('./discord-rpc');
const packageInfo = require('./package.json');

process.title = 'AnimeLook';

app.name = 'AnimeLook';
app.setName('AnimeLook');



app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('high-dpi-support', 1);
app.commandLine.appendSwitch('force-device-scale-factor', 1);
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('ignore-gpu-blacklist');
app.commandLine.appendSwitch('disable-software-rasterizer');

app.setPath('userData', path.join(app.getPath('appData'), 'AnimeLook'));

const cacheDir = path.join(app.getPath('userData'), 'GPUCache');
if (!fs.existsSync(cacheDir)) {
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    console.log('GPU cache dizini oluşturuldu:', cacheDir);
  } catch (error) {
    console.log('GPU cache dizini oluşturulamadı:', error.message);
  }
}


const store = new Store({
  name: 'settings',
  defaults: {
    startAtBoot: true,
    runInBackground: true,
    performanceMode: 'balanced' 
  }
});


let mainWindow = null;
let pipWindow = null;
let tray = null;
let isQuitting = false;
let currentUrl = "https://animelook.net/";
let splashWindow = null;

const setAutoLaunch = (enabled) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: app.getPath('exe')
  });
};

function applyPerformanceSettings(mode) {
  if (!mainWindow) return;
  
  switch (mode) {
    case 'performance':
      mainWindow.webContents.setAudioMuted(false);
      app.commandLine.appendSwitch('enable-gpu-rasterization');
      app.commandLine.appendSwitch('enable-zero-copy');
      break;
    case 'battery-saver':
      mainWindow.webContents.setAudioMuted(true);
      app.commandLine.appendSwitch('disable-gpu');
      app.commandLine.appendSwitch('disable-smooth-scrolling');
      break;
    case 'balanced':
    default:
      mainWindow.webContents.setAudioMuted(false);
      break;
  }
}


function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 400,
    transparent: false,
    frame: false,
    resizable: false,
    center: true,
    show: false,
    title: 'AnimeLook',
    icon: path.join(__dirname, 'assets/icon.ico'),
    autoHideMenuBar: true,
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  splashWindow.loadFile('splash.html');
  
  splashWindow.once('ready-to-show', () => {
    splashWindow.show();
  });
  
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}


function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'assets/icon.ico'),
    title: 'AnimeLook',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
      partition: 'persist:animelook',
      cache: true,
      persistentCookies: true
    },
    frame: false, 
    backgroundColor: '#2e2c29',
    show: false,
    autoHideMenuBar: true,
    skipTaskbar: false
  });

  mainWindow.loadFile('index.html');
  
  const savedZoomLevel = store.get('zoomLevel') || 100;
  mainWindow.webContents.setZoomFactor(savedZoomLevel / 100);
  
  
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {

    if (url.includes('animelook.net')) {
      return { action: 'allow' };
    }

    mainWindow.webContents.loadURL('https://animelook.net/');
    return { action: 'deny' };
  });


  mainWindow.once('ready-to-show', () => {
    if (app.getLoginItemSettings().wasOpenedAtLogin && store.get('startAtBoot')) {
      mainWindow.hide();
    } else {
      mainWindow.maximize();
    }
  });

  mainWindow.webContents.on('did-start-loading', () => {
    mainWindow.webContents.send('loading', true);
  });

  mainWindow.webContents.on('did-stop-loading', () => {
    mainWindow.webContents.send('loading', false);
  });
  
  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('fullscreen-change', true);
  });
  
  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('fullscreen-change', false);
  });

  mainWindow.webContents.on('did-navigate-in-page', (event, url) => {
    currentUrl = url;
    console.log('URL değişti (in-page):', currentUrl);
  });
  
  mainWindow.webContents.on('did-navigate', (event, url) => {
    currentUrl = url;
    console.log('URL değişti:', currentUrl);
  });
  
  function setupWebviewListeners() {
    setTimeout(() => {
      if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
        mainWindow.webContents.executeJavaScript(`
          try {
            const webviewElement = document.getElementById('webview');
            if (webviewElement && typeof webviewElement.getURL === 'function') {
              if (window.updateUrlHandler) {
                webviewElement.removeEventListener('did-navigate', window.updateUrlHandler);
                webviewElement.removeEventListener('did-navigate-in-page', window.updateUrlHandler);
              }
              
              window.updateUrlHandler = function() {
                try {
                  const url = webviewElement.getURL();
                  if (window.electronAPI && window.electronAPI.updateCurrentUrl) {
                    window.electronAPI.updateCurrentUrl(url);
                  }
                } catch (error) {
                  console.log('URL güncelleme hatası:', error.message);
                }
              };
              
              webviewElement.addEventListener('did-navigate', window.updateUrlHandler);
              webviewElement.addEventListener('did-navigate-in-page', window.updateUrlHandler);
              webviewElement.addEventListener('dom-ready', window.updateUrlHandler);
            }
          } catch (error) {
            console.log('Webview listener kurulum hatası:', error.message);
          }
        `).catch(err => {
          if (!err.message.includes('Script failed to execute')) {
            console.error('Webview URL izleme hatası:', err);
          }
        });
      }
    }, 1000);
  }
  
  setupWebviewListeners();
  
  mainWindow.webContents.on('did-finish-load', setupWebviewListeners);
  mainWindow.webContents.on('did-navigate', setupWebviewListeners);

  mainWindow.on('close', (event) => {
    if (!isQuitting && store.get('runInBackground')) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });
}

function createPipWindow(url, videoElement, currentTime, videoId) {
  const { width: screenWidth, height: screenHeight } = require('electron').screen.getPrimaryDisplay().workAreaSize;
  
  pipWindow = new BrowserWindow({
    width: 400,
    height: 225,
    x: screenWidth - 420,
    y: screenHeight - 245,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    title: 'AnimeLook - PiP Modu',
    icon: path.join(__dirname, 'assets/icon.ico'),
    autoHideMenuBar: true, 
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
      partition: 'persist:animelook'
    },
    backgroundColor: '#1a1a1a',
    minWidth: 320,
    minHeight: 180,
    maxWidth: 800,
    maxHeight: 450
  });
  
  const pipHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <style>
      body {
        margin: 0;
        padding: 0;
        overflow: hidden;
        background-color: #1a1a1a;
        display: flex;
        flex-direction: column;
        height: 100vh;
      }
      
      #pip-titlebar {
        height: 28px;
        background-color: #1a1a1a;
        display: flex;
        align-items: center;
        justify-content: space-between;
        -webkit-app-region: drag;
        user-select: none;
        border-bottom: 1px solid #333;
        padding: 0 8px;
      }
      
      .pip-title {
        font-size: 12px;
        font-weight: 500;
        color: #2196F3;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      }
      
      .pip-close-button {
        background: transparent;
        border: none;
        color: #ccc;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        outline: none;
        border-radius: 3px;
        -webkit-app-region: no-drag;
      }
      
      .pip-close-button:hover {
        background-color: #e81123;
        color: #fff;
      }
      
      #pip-content {
        flex: 1;
        overflow: hidden;
      }
      
      #pip-webview {
        width: 100%;
        height: 100%;
        border: none;
      }
    </style>
  </head>
  <body>
    <div id="pip-titlebar">
      <div class="pip-title">AnimeLook</div>
      <button id="pip-close-button" class="pip-close-button">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div id="pip-content">
      <webview id="pip-webview" src="${url}" webpreferences="contextIsolation=yes, nodeIntegration=no" partition="persist:animelook"></webview>
    </div>
  </body>
  </html>
  `;
  
  const pipHtmlPath = path.join(app.getPath('temp'), 'pip-window.html');
  fs.writeFileSync(pipHtmlPath, pipHtml);
  
  pipWindow.loadFile(pipHtmlPath);
  
  pipWindow.webContents.on('did-finish-load', () => {
    pipWindow.webContents.executeJavaScript(`
      const pipWebview = document.getElementById('pip-webview');
      const videoStartTime = ${currentTime || 0};
      const videoId = "${videoId || ''}";
      
      function findAndFocusMediaElement() {
        pipWebview.executeJavaScript(
          \`(function() {
            const mediaSelectors = [
              'video',
              'iframe',
              '.video-js', '.jw-video', '.plyr', '.video-container', '.player-container',
              '.anime-video', '.episode-video', '.video-frame',
              '.html5-video-player', '.vjs-tech', '.mejs__mediaelement',
              '[class*="player"]', '[id*="player"]', '[class*="video"]', '[id*="video"]'
            ];
            
            const allMediaElements = document.querySelectorAll(mediaSelectors.join(', '));
            let videoFound = false;
            

            for (let i = 0; i < allMediaElements.length; i++) {
              const element = allMediaElements[i];
              
              if (element.tagName.toLowerCase() === 'video') {
                videoFound = true;
                element.scrollIntoView({behavior: 'smooth', block: 'center'});
                console.log('PiP: Video elementi bulundu ve odaklandı');
                
            
                const startVideo = () => {
                  const timeToSet = ${currentTime || 0};
                  if (timeToSet > 0) {
                    console.log('PiP: Video kaldığı yerden başlatılıyor:', timeToSet);
                    element.currentTime = timeToSet;
                    
                 
                    const attemptPlay = (attempts = 0) => {
                      if (attempts > 5) return;
                      
                      element.play().then(() => {
                        console.log('PiP: Video başarıyla başlatıldı');
                      }).catch(e => {
                        console.error('PiP: Video oynatma hatası:', e);
                        
                        setTimeout(() => attemptPlay(attempts + 1), 500);
                      });
                    };
                    
                    attemptPlay();
                  }
                };
                
                if (element.readyState >= 2) {
                  startVideo();
                } else {
                  element.addEventListener('loadeddata', startVideo, { once: true });
                  element.addEventListener('canplay', startVideo, { once: true });
                 
                  setTimeout(startVideo, 1000);
                }
                
                break;
              }
            }
            
      
            if (!videoFound && allMediaElements.length > 0) {
              for (let i = 0; i < allMediaElements.length; i++) {
                const element = allMediaElements[i];
                
                if (element.tagName.toLowerCase() === 'iframe') {
                  element.scrollIntoView({behavior: 'smooth', block: 'center'});
                  console.log('PiP: Iframe elementi bulundu ve odaklandı');
                  
            
                  element.style.display = 'block';
                  element.style.visibility = 'visible';
                  element.style.opacity = '1';
                  
               
                  let parent = element.parentElement;
                  while (parent) {
                    const style = window.getComputedStyle(parent);
                    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                      parent.style.display = 'block';
                      parent.style.visibility = 'visible';
                      parent.style.opacity = '1';
                    }
                    parent = parent.parentElement;
                  }
                  
                  break;
                }
              }
            }
            
            if (allMediaElements.length === 0) {
              console.log('PiP: Hiçbir medya elementi bulunamadı');
              return false;
            }
            
            return true;
          })()\`
        ).catch(err => console.error('PiP medya arama hatası:', err));
      }
      
      pipWebview.addEventListener('dom-ready', () => {
        findAndFocusMediaElement();
        
        pipWebview.executeJavaScript(\`
          if (window.pipMutationObserver) {
            window.pipMutationObserver.disconnect();
          }
          
          window.pipMutationObserver = new MutationObserver((mutations) => {
            console.log('PiP: DOM değişikliği algılandı, medya elementleri kontrol ediliyor...');
            
            clearTimeout(window.pipMediaCheckTimeout);
            window.pipMediaCheckTimeout = setTimeout(() => {
              const mediaSelectors = [
                'video', 'iframe', '.video-js', '.jw-video', '.plyr', '.video-container', '.player-container',
                '.anime-video', '.episode-video', '.video-frame', '.html5-video-player', '.vjs-tech',
                '[class*="player"]', '[id*="player"]', '[class*="video"]', '[id*="video"]'
              ];
              
              const allMediaElements = document.querySelectorAll(mediaSelectors.join(', '));
              let videoFound = false;
              
              
              for (let i = 0; i < allMediaElements.length; i++) {
                const element = allMediaElements[i];
                
                if (element.tagName.toLowerCase() === 'video') {
                  videoFound = true;
                  element.scrollIntoView({behavior: 'smooth', block: 'center'});
                  console.log('PiP: DOM değişikliği sonrası video elementi bulundu');
                  
                  
                  if (videoStartTime > 0) {
                    console.log('PiP: DOM değişikliği sonrası video kaldığı yerden başlatılıyor:', videoStartTime);
                    element.currentTime = videoStartTime;
                
                    const attemptPlay = (attempts = 0) => {
                      if (attempts > 5) return;
                      
                      element.play().then(() => {
                        console.log('PiP: Video başarıyla başlatıldı');
                      }).catch(e => {
                        console.error('PiP: Video oynatma hatası:', e);
                       
                        setTimeout(() => attemptPlay(attempts + 1), 500);
                      });
                    };
                    
                    attemptPlay();
                  }
                  
                  break;
                }
              }
              
           
              if (!videoFound && allMediaElements.length > 0) {
                for (let i = 0; i < allMediaElements.length; i++) {
                  const element = allMediaElements[i];
                  
                  if (element.tagName.toLowerCase() === 'iframe') {
                    element.scrollIntoView({behavior: 'smooth', block: 'center'});
                    console.log('PiP: DOM değişikliği sonrası iframe elementi bulundu');
                    
                 
                    element.style.display = 'block';
                    element.style.visibility = 'visible';
                    element.style.opacity = '1';
                    
                 
                    let parent = element.parentElement;
                    while (parent) {
                      const style = window.getComputedStyle(parent);
                      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                        parent.style.display = 'block';
                        parent.style.visibility = 'visible';
                        parent.style.opacity = '1';
                      }
                      parent = parent.parentElement;
                    }
                    
                    break;
                  }
                }
              }
            }, 500); 
          });
          
          window.pipMutationObserver.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'style', 'class']
          });
          
          console.log('PiP: DOM değişikliklerini izleme başlatıldı');
        \`).catch(err => console.error('PiP MutationObserver hatası:', err));
      });
      
      pipWebview.addEventListener('did-navigate', () => {
        console.log('PiP: Sayfa değişti, medya elementleri aranıyor...');
        setTimeout(findAndFocusMediaElement, 500);
        setTimeout(findAndFocusMediaElement, 1500);
        setTimeout(findAndFocusMediaElement, 3000);
      });
      
      pipWebview.addEventListener('did-navigate-in-page', () => {
        console.log('PiP: Sayfa içi navigasyon, medya elementleri aranıyor...');
        setTimeout(findAndFocusMediaElement, 500);
        setTimeout(findAndFocusMediaElement, 1500);
      });
      
      pipWebview.addEventListener('did-start-loading', () => {
        console.log('PiP: Sayfa yükleniyor...');
      });
      
      pipWebview.addEventListener('did-stop-loading', () => {
        console.log('PiP: Sayfa yüklendi, medya elementleri aranıyor...');
        setTimeout(findAndFocusMediaElement, 500);
        setTimeout(findAndFocusMediaElement, 1500);
        setTimeout(findAndFocusMediaElement, 3000);
      });
    `);
    
    pipWindow.webContents.executeJavaScript(`
      document.getElementById('pip-close-button').addEventListener('click', () => {
        window.close();
      });
    `);
  });

  pipWindow.setAlwaysOnTop(true, 'screen-saver');
  pipWindow.setVisibleOnAllWorkspaces(true);
  
  pipWindow.on('closed', () => {
    pipWindow = null;
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}


function closePipWindow() {
  if (pipWindow) {
    pipWindow.close();
    pipWindow = null;
  }
  
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('pip-mode-change', false);
  }
}


function createTray() {
  tray = new Tray(path.join(__dirname, 'assets/icon.ico'));
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Uygulamayı Aç', 
      click: () => { 
        mainWindow.show(); 
        mainWindow.focus(); 
      }
    },
    { 
      label: 'Ayarlar', 
      click: () => { 
        mainWindow.show();
        mainWindow.webContents.send('open-settings'); 
      }
    },
    { type: 'separator' },
    { 
      label: 'Çıkış', 
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('AnimeLook');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}


function clearAppCache() {
  return new Promise((resolve, reject) => {
    try {
      const userDataPath = app.getPath('userData');
      
      const cachePaths = [
        path.join(userDataPath, 'Cache'),
        path.join(userDataPath, 'Code Cache'),
        path.join(userDataPath, 'GPUCache')
      ];
      
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.session.clearCache();
        console.log('Webview önbelleği temizlendi');
        
        mainWindow.webContents.executeJavaScript(`
          const webview = document.getElementById('webview');
          if (webview && webview.getWebContents) {
            try {
              webview.executeJavaScript('navigator.serviceWorker.getRegistrations().then(registrations => { registrations.forEach(registration => { registration.unregister(); }); });', true);
              console.log('Webview içindeki service worker kayıtları temizlendi');
            } catch (e) {
              console.error('Service worker temizleme hatası:', e);
            }
          }
        `).catch(err => console.error('Webview script hatası:', err));
      }

      let deletedFiles = 0;
      let errors = 0;
      
      cachePaths.forEach(cachePath => {
        if (fs.existsSync(cachePath)) {
          try {
            const files = fs.readdirSync(cachePath);
            files.forEach(file => {
              if (!file.includes('index') && !file.includes('.db') && !file.includes('MANIFEST')) {
                try {
                  fs.unlinkSync(path.join(cachePath, file));
                  deletedFiles++;
                } catch (err) {
                  console.error(`Dosya silinemedi: ${file}`, err);
                  errors++;
                }
              }
            });
          } catch (err) {
            console.error(`Dizin okunamadı: ${cachePath}`, err);
            errors++;
          }
        }
      });
      
      console.log(`Önbellek temizlendi: ${deletedFiles} dosya silindi, ${errors} hata oluştu`);
      resolve({ deletedFiles, errors });
    } catch (err) {
      console.error('Önbellek temizlenirken hata oluştu:', err);
      reject(err);
    }
  });
}


function setupIPC() {
  ipcMain.on('toggle-mini-mode', (event, isActive) => {
    if (!mainWindow) return;
    
    if (isActive) {
      const { width: screenWidth, height: screenHeight } = require('electron').screen.getPrimaryDisplay().workAreaSize;
      mainWindow.setSize(400, 300);
      mainWindow.setPosition(screenWidth - 420, screenHeight - 320);
      mainWindow.setAlwaysOnTop(true, 'floating');
      mainWindow.setVisibleOnAllWorkspaces(true);
      mainWindow.setSkipTaskbar(false);
    } else {
      mainWindow.setSize(1200, 800);
      mainWindow.center();
      mainWindow.setAlwaysOnTop(false);
      mainWindow.setVisibleOnAllWorkspaces(false);
      mainWindow.setSkipTaskbar(false);
    }

    mainWindow.webContents.send('mini-mode-change', isActive);
  });
  
  ipcMain.on('toggle-pip-mode', (event, url, hasVideo, videoElement, currentTime, videoId) => {
    if (!pipWindow && hasVideo) {
      const pipUrl = url || currentUrl;
      console.log('PiP modu başlatılıyor, URL:', pipUrl, 'Video konumu:', currentTime);
      
      if (mainWindow) {
        mainWindow.webContents.executeJavaScript(`
          (function() {
            const webview = document.getElementById('webview');
            if (webview) {
              webview.executeJavaScript(
                "(function() {\n" +
                "  const videos = document.querySelectorAll('video');\n" +
                "  if (videos.length > 0) {\n" +
                "    console.log('Ana penceredeki video durduruluyor...');\n" +
                "    \n" +
                "    try {\n" +
                "      videos[0].click();\n" +
                "      console.log('Video tıklandı');\n" +
                "      \n" +
                "      setTimeout(() => {\n" +
                "        if (!videos[0].paused) {\n" +
                "          videos[0].pause();\n" +
                "          console.log('Video pause() metodu ile durduruldu');\n" +
                "        }\n" +
                "      }, 100);\n" +
                "    } catch (e) {\n" +
                "      console.error('Video tıklama hatası:', e);\n" +
                "    }\n" +
                "     \n" +
                "    videos.forEach(video => {\n" +
                "      if (!video.paused) {\n" +
                "        video.pause();\n" +
                "        console.log('Video durduruldu');\n" +
                "      }\n" +
                "    });\n" +
                "    return true;\n" +
                "  }\n" +
                "  return false;\n" +
                "})()"
              ).catch(err => console.log('Video durdurma iç hata:', err));
            }
            return true;
          })()
        `).catch(err => console.error('Video durdurma hatası:', err));
      }
      
      createPipWindow(pipUrl, videoElement, currentTime, videoId);
      mainWindow.hide();
      mainWindow.webContents.send('pip-mode-change', true);
    } else if (pipWindow) {
      closePipWindow();
    } else {
      mainWindow.webContents.send('pip-error', 'Bu sayfada video veya iframe bulunamadı!');
    }
  });
  
  ipcMain.on('close-pip-window', () => {
    closePipWindow();
  });
  
  ipcMain.handle('get-current-url', () => {
    return currentUrl;
  });
  
  ipcMain.on('update-current-url', (event, url) => {
    currentUrl = url;
    console.log('URL güncellendi:', currentUrl);
  });
  
  ipcMain.on('open-external-url', (event, url) => {
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname === 'animelook.net' || urlObj.hostname.endsWith('.animelook.net')) {
        console.log('AnimeLook URL açılıyor:', url);
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.loadURL(url);
        }
      } else {
        console.log('Harici URL anasayfaya yönlendiriliyor');
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.loadURL('https://animelook.net/');
        }
      }
    } catch (error) {
      console.error('Geçersiz URL:', url, error);
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.loadURL('https://animelook.net/');
      }
    }
  });
  
  ipcMain.on('redirect-to-homepage', (event) => {
    console.log('Harici link anasayfaya yönlendiriliyor');
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.loadURL('https://animelook.net/');
    }
  });

  ipcMain.on('window-control', (event, action) => {
    if (!mainWindow) return;
    
    switch (action) {
      case 'minimize':
        mainWindow.minimize();
        break;
      case 'maximize':
        if (mainWindow.isMaximized()) {
          mainWindow.unmaximize();
        } else {
          mainWindow.maximize();
        }
        break;
      case 'close':
        if (store.get('runInBackground')) {
          mainWindow.hide();
        } else {
          isQuitting = true;
          app.quit();
        }
        break;
      case 'hide':
        mainWindow.hide();
        break;
      case 'show':
        mainWindow.show();
        mainWindow.focus();
        break;
      case 'back':
        if (mainWindow.webContents.canGoBack()) {
          mainWindow.webContents.goBack();
        }
        break;
      case 'forward':
        if (mainWindow.webContents.canGoForward()) {
          mainWindow.webContents.goForward();
        }
        break;
      case 'reload':
        mainWindow.webContents.reload();
        break;
    }
  });

  ipcMain.on('save-settings', (event, settings) => {
    store.set('startAtBoot', settings.startAtBoot);
    store.set('runInBackground', settings.runInBackground);
    store.set('performanceMode', settings.performanceMode);
    store.set('zoomLevel', settings.zoomLevel);
    
    setAutoLaunch(settings.startAtBoot);
    applyPerformanceSettings(settings.performanceMode);
    
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.setZoomFactor(settings.zoomLevel / 100);
    }
    
    event.reply('settings-saved', true);
  });

  ipcMain.handle('get-settings', async () => {
    return {
      startAtBoot: store.get('startAtBoot'),
      runInBackground: store.get('runInBackground'),
      performanceMode: store.get('performanceMode'),
      zoomLevel: store.get('zoomLevel') || 100
    };
  });
  
  ipcMain.on('set-zoom-level', (event, zoomLevel) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.setZoomFactor(zoomLevel / 100);
      store.set('zoomLevel', zoomLevel);
    }
  });
  

  ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-app-info', async () => {
  let releaseNotes = "";
  try {
    const axios = require('axios');
    const GITHUB_OWNER = 'creampe';
    const GITHUB_REPO = 'AnimeLook-Desktop';
    const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
    
    const response = await axios.get(GITHUB_API_URL);
    const latestRelease = response.data;
    releaseNotes = latestRelease.body || "";
  } catch (error) {
    console.error('GitHub API ile güncelleme notları alınamadı:', error);
  }
  
  return {
    version: app.getVersion(),
    name: packageInfo.name,
    description: packageInfo.description,
    author: packageInfo.author,
    releaseNotes: releaseNotes
  };
});
  
  ipcMain.handle('clear-cache', async () => {
    try {
      const result = await clearAppCache();
      return { success: true, ...result };
    } catch (error) {
      console.error('Önbellek temizleme hatası:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.on('check-for-updates', () => {
    updater.checkForUpdates();
  });

  ipcMain.on('download-update', () => {
    updater.downloadUpdate();
  });

  ipcMain.on('install-update', () => {
    updater.installUpdate();
  });
  
  ipcMain.on('show-main-window', () => {
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }
    
    if (!mainWindow) {
      createWindow();
      updater.initUpdater(mainWindow, null);
      
      if (app.getLoginItemSettings().wasOpenedAtLogin && store.get('startAtBoot')) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    } else {
      if (!app.getLoginItemSettings().wasOpenedAtLogin || !store.get('startAtBoot')) {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}


const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
      if (process.platform === 'win32') {
        app.setAppUserModelId('com.animelook.desktop');
        
        app.setAsDefaultProtocolClient('animelook');
      }
      
      setupIPC();
      createSplashWindow();
      createTray();
      discordRPC.init();
      updater.initUpdater(null, splashWindow);
      
      if (store.get('startAtBoot') === undefined) {
        store.set('startAtBoot', true);
        setAutoLaunch(true);
      }
      
      applyPerformanceSettings(store.get('performanceMode'));
      
      app.setName('AnimeLook');
      
      if (tray) {
        tray.setImage(path.join(__dirname, 'assets/icon.ico'));
      }
    });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    discordRPC.destroy();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else if (mainWindow) {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});