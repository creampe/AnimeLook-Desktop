const DiscordRPC = require('discord-rpc');
const { ipcMain } = require('electron');
const clientId = '1405521962368892948'; 


let rpc = null;
let connected = false;
let currentActivity = null;


async function initRPC() {

  if (connected) return;


  rpc = new DiscordRPC.Client({ transport: 'ipc' });


  rpc.on('ready', () => {
    console.log('Discord RPC bağlandı');
    connected = true;

    if (currentActivity) {
      setActivity(currentActivity);
    } else {
      setActivity({
        details: 'AnimeLook\'ta geziniyor',
        state: 'Ana Sayfa',
        largeImageKey: 'animelook_logo',
        largeImageText: 'AnimeLook',
        instance: false
      });
    }
  });

  rpc.on('disconnected', () => {
    console.log('Discord RPC bağlantısı kesildi');
    connected = false;
  });


  try {
    await rpc.login({ clientId });
  } catch (error) {
    console.error('Discord RPC bağlantı hatası:', error);
  }
}


function setActivity(activity) {
  currentActivity = activity;
  
  if (!connected || !rpc) {
    console.log('Discord RPC bağlı değil, aktivite ayarlanamadı');
    return;
  }

  try {
    rpc.setActivity(activity);
    console.log('Discord RPC aktivitesi güncellendi:', activity);
  } catch (error) {
    console.error('Discord RPC aktivite ayarlama hatası:', error);
  }
}


function setAnimeWatchingActivity(animeTitle, episodeInfo, remainingTime) {
  const now = new Date();
  

  if (typeof animeTitle === 'object' && animeTitle !== null) {
    const data = animeTitle;
    const activity = {
      details: data.animeTitle || 'Anime izliyor',
      state: data.episodeInfo || '',
      startTimestamp: now,
      largeImageKey: 'animelook_logo',
      largeImageText: 'AnimeLook',
      smallImageKey: 'watching',
      smallImageText: 'İzliyor',
      instance: false
    };
    

    if (data.remainingTime && !isNaN(data.remainingTime)) {
      activity.endTimestamp = new Date(now.getTime() + (data.remainingTime * 1000));
    }
    
    setActivity(activity);
    return;
  }
  

  const activity = {
    details: episodeInfo || 'AnimeLook\'ta Anime İzliyor.', 
    state: animeTitle || 'Anime İzliyor.',
    startTimestamp: now,
    largeImageKey: 'animelook_logo',
    largeImageText: 'AnimeLook',
    smallImageKey: 'watching',
    smallImageText: 'İzliyor',
    instance: false
  };


  if (remainingTime && !isNaN(remainingTime)) {
    activity.endTimestamp = new Date(now.getTime() + (remainingTime * 1000));
  }

  setActivity(activity);
}


function setAnimeSearchActivity() {
  setActivity({
    details: 'AnimeLook\'ta',
    state: 'Anime arıyor',
    largeImageKey: 'animelook_logo',
    largeImageText: 'AnimeLook',
    smallImageKey: 'search',
    smallImageText: 'Arıyor',
    instance: false
  });
}

function setBrowsingActivity(pageTitle) {
  setActivity({
    details: 'AnimeLook\'ta geziniyor',
    state: pageTitle || 'Ana Sayfa',
    largeImageKey: 'animelook_logo',
    largeImageText: 'AnimeLook',
    instance: false
  });
}


function destroyRPC() {
  if (rpc) {
    rpc.destroy();
    connected = false;
    rpc = null;
    console.log('Discord RPC kapatıldı');
  }
}


function setupIPCHandlers() {

  ipcMain.on('discord-set-watching', (event, { animeTitle, episodeInfo, remainingTime }) => {
    setAnimeWatchingActivity(animeTitle, episodeInfo, remainingTime);
  });


  ipcMain.on('discord-set-searching', () => {
    setAnimeSearchActivity();
  });


  ipcMain.on('discord-set-browsing', (event, pageTitle) => {
    setBrowsingActivity(pageTitle);
  });
}


module.exports = {
  init: () => {
    initRPC();
    setupIPCHandlers();
  },
  destroy: destroyRPC,
  setWatching: setAnimeWatchingActivity,
  setSearching: setAnimeSearchActivity,
  setBrowsing: setBrowsingActivity
};