/**
 * @author TECNO BROS
 */

"use strict";
const electron = require("electron");
const { BrowserView } = require("electron");
const path = require("path");
const os = require("os");
const pkg = require("../../../../package.json");
let mainWindow = undefined;
let notificationWindow = undefined;
let selectLangWindow = undefined;
let syncInProgress = false; // Flag para controlar si hay sincronización en progreso
const { app, net, protocol } = require("electron");
const { ipcMain } = require("electron");
let dev = process.env.NODE_ENV === "dev";
const { getValue, setValue } = require('../utils/storage');
const fs = require("fs");
const dataDirectory =
  process.env.APPDATA ||
  (process.platform == "darwin"
    ? `${process.env.HOME}/Library/Application Support`
    : process.env.HOME);


function getWindow() {
  return mainWindow;
}

function destroyWindow() {
  if (!mainWindow) return;
  mainWindow.close();
  mainWindow = undefined;
}

async function createWindow() {
  destroyWindow();
  mainWindow = new electron.BrowserWindow({
    title: pkg.productname,
    titleBarStyle: (os.platform() == "darwin" || os.platform() == "linux") ? "hidden" : "default",
    width: 1280,
    height: 720,
    minWidth: 980,
    minHeight: 552,
    resizable: true,
    transparent: false,
    icon: `./src/assets/images/icon.${os.platform() === "win32" ? "ico" : "png"
      }`,
    frame: os.platform() === "win32" ? false : true,
    show: fs.existsSync(`${dataDirectory}\\.battly\\launchboost`) ? false : true,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      devTools: true,
      experimentalFeatures: false,
    },
  });

  if (mainWindow) {
    if (process.platform === "darwin") {
      mainWindow.setWindowButtonVisibility(false);
    }
    if (dev) {
      mainWindow.openDevTools();
    }
  }

  mainWindow.loadFile(
    path.join(electron.app.getAppPath(), "src", "launcher.html")
  );


  notificationWindow = new electron.BrowserWindow({
    title: pkg.productname,
    width: 350,
    height: 170,
    minWidth: 200,
    minHeight: 100,
    resizable: false,
    x: electron.screen.getPrimaryDisplay().workAreaSize.width - 370,
    y: electron.screen.getPrimaryDisplay().workAreaSize.height - 200,
    icon: `./src/assets/images/icon.${os.platform() === "win32" ? "ico" : "png"
      }`,
    transparent: true,
    frame: false,
    show: false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      devTools: true,
    },
  });

  selectLangWindow = new electron.BrowserWindow({
    title: pkg.productname,
    width: 853,
    height: 480,
    minWidth: 853,
    minHeight: 480,
    resizable: true,
    icon: `./src/assets/images/icon.${os.platform() === "win32" ? "ico" : "png"
      }`,
    transparent: true,
    frame: false,
    show: false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      devTools: true,
    },
  });

  notificationWindow.setSkipTaskbar(true);

  notificationWindow.loadFile(
    path.join(electron.app.getAppPath(), "src", "panels", "music-small.html")
  );

  // notificationWindow.hide();

  electron.Menu.setApplicationMenu(null);
  mainWindow.setMenuBarVisibility(false);

  let lang;
  mainWindow.once("ready-to-show", async () => {
    try {
      lang = await getValue('lang');
      console.log("Current language:", lang);

      // Si no hay idioma configurado (primera vez), establecer español y mostrar el selector
      if (!lang || lang === null || lang === undefined) {
        // Establecer español como idioma predeterminado
        await setValue('lang', 'es');

        selectLangWindow.loadFile(
          path.join(
            electron.app.getAppPath(),
            "src",
            "panels",
            "select-lang.html"
          )
        );
        selectLangWindow.once("ready-to-show", () => {
          if (selectLangWindow) {
            selectLangWindow.show();
            if (dev) {
              selectLangWindow.openDevTools();
            }
          }
        });
      } else {
        mainWindow.show();
      }
    } catch (error) {
      console.error("Error al ejecutar JavaScript:", error);
      mainWindow.show();
    }
  });

  let musicPlayed = false;
  let musicPanelClosed = false;
  let currentSongData = null; // Almacenar información de la canción actual

  ipcMain.on("set-song", async (event, song) => {
    console.log('🎵 Nueva canción detectada:', song?.title || 'Sin título');
    musicPlayed = true;
    musicPanelClosed = false; // Reset cuando se reproduce una nueva canción
    currentSongData = song; // Guardar datos de la canción

    // Si la ventana principal está minimizada u oculta, mostrar el mini player según configuración
    if (mainWindow && (mainWindow.isMinimized() || !mainWindow.isVisible())) {
      console.log('   Ventana minimizada/oculta - Verificando configuración...');
      try {
        const launcherConfig = await getValue('launcher');
        const closeMusic = launcherConfig?.launcher?.closeMusic || 'close-music';

        console.log('   Configuración closeMusic:', closeMusic);

        if (closeMusic === 'open-music' && notificationWindow) {
          notificationWindow.show();
          // Enviar información de la canción actual al panel
          if (currentSongData) {
            notificationWindow.webContents.send("get-song-test", currentSongData);
          }
          console.log('✅ Panel de música mostrado (nueva canción)');
        }
      } catch (error) {
        console.error('❌ Error al verificar configuración:', error);
      }
    } else {
      console.log('   Ventana visible - Panel no se muestra aún');
    }
  });

  notificationWindow.once("ready-to-show", async () => {
    if (notificationWindow) {
      if (dev) {
        notificationWindow.openDevTools();
      }

      // Leer la configuración para saber si debe mostrarse
      try {
        const launcherConfig = await getValue('launcher');
        const closeMusic = launcherConfig?.launcher?.closeMusic || 'close-music';

        // Solo mostrar si la configuración es 'open-music' y hay música reproduciéndose
        if (closeMusic === 'open-music' && musicPlayed) {
          notificationWindow.show();
          // Enviar información de la canción actual al panel
          if (currentSongData) {
            notificationWindow.webContents.send("get-song-test", currentSongData);
          }
        } else {
          notificationWindow.hide();
        }
      } catch (error) {
        console.error('Error al leer configuración de música:', error);
        notificationWindow.hide();
      }
    }
  });

  mainWindow.once("minimize", async () => {
    if (mainWindow) {
      if (musicPlayed && !musicPanelClosed) {
        // Verificar configuración antes de mostrar
        try {
          const launcherConfig = await getValue('launcher');
          const closeMusic = launcherConfig?.launcher?.closeMusic || 'close-music';

          if (closeMusic === 'open-music') {
            setTimeout(() => {
              notificationWindow.show();
              // Enviar información de la canción actual al panel
              if (currentSongData) {
                notificationWindow.webContents.send("get-song-test", currentSongData);
              }
            }, 100);
          }
        } catch (error) {
          console.error('Error al verificar configuración:', error);
        }
      }
    }
  });

  mainWindow.once("restore", () => {
    if (notificationWindow) {
      notificationWindow.hide();
    }
  });

  mainWindow.on("close", (event) => {
    if (syncInProgress) {
      console.log('🔄 Sincronización en progreso. Ocultando ventana en lugar de cerrar...');
      event.preventDefault(); // Prevenir el cierre
      mainWindow.hide(); // Solo ocultar la ventana
    } else {
      process.exit(0);
    }
  });

  ipcMain.on("closed", () => {
    if (notificationWindow) {
      notificationWindow.close();
      notificationWindow = undefined;
    }
  });

  ipcMain.on("main-window-hide", async (event, data) => {
    if (mainWindow) {
      const shouldHideLauncher = data?.shouldHideLauncher !== false; // Por defecto true para compatibilidad

      console.log('🎮 Minecraft iniciado - Verificando panel de música...');
      console.log('   musicPlayed:', musicPlayed, '| musicPanelClosed:', musicPanelClosed);
      console.log('   shouldHideLauncher:', shouldHideLauncher);

      // Manejar el panel de música independientemente de la configuración del launcher
      if (musicPlayed && !musicPanelClosed) {
        // Verificar configuración antes de mostrar
        try {
          const launcherConfig = await getValue('launcher');
          const closeMusic = launcherConfig?.launcher?.closeMusic || 'close-music';

          console.log('   Configuración closeMusic:', closeMusic);

          if (closeMusic === 'open-music') {
            // Pequeño delay para asegurar que la ventana principal ya está oculta
            setTimeout(() => {
              if (notificationWindow && !notificationWindow.isDestroyed()) {
                notificationWindow.show();
                // Enviar información de la canción actual al panel
                if (currentSongData) {
                  notificationWindow.webContents.send("get-song-test", currentSongData);
                }
                console.log('✅ Panel de música mostrado');
              }
            }, 300);
          } else {
            console.log('⏭️  Panel de música no mostrado (configuración: close-music)');
          }
        } catch (error) {
          console.error('❌ Error al verificar configuración:', error);
        }
      } else {
        if (!musicPlayed) console.log('⏭️  No hay música reproduciéndose');
        if (musicPanelClosed) console.log('⏭️  Panel cerrado manualmente por el usuario');
      }

      // Ocultar la ventana principal solo si la configuración lo permite
      if (shouldHideLauncher) {
        mainWindow.hide();
        console.log('🔽 Ventana principal oculta');
      } else {
        console.log('👁️  Ventana principal permanece visible');
      }
    }
  });

  ipcMain.on("main-window-show", () => {
    if (mainWindow) {
      notificationWindow.hide();
    }
  });

  // Manejar el cierre manual del panel de música
  ipcMain.on("close-mini-player", () => {
    if (notificationWindow) {
      musicPanelClosed = true;
      notificationWindow.hide();
    }
  });

  // Manejar cambio de configuración del panel de música
  ipcMain.on("music-panel-config-changed", (event, newConfig) => {
    console.log('🎵 Configuración de panel de música cambiada a:', newConfig);

    // Si cambió a "open-music" y hay música reproduciéndose y la ventana está minimizada
    if (newConfig === 'open-music' && musicPlayed && !musicPanelClosed) {
      if (mainWindow && (mainWindow.isMinimized() || !mainWindow.isVisible())) {
        notificationWindow.show();
        // Enviar información de la canción actual al panel
        if (currentSongData) {
          notificationWindow.webContents.send("get-song-test", currentSongData);
        }
      }
    }
    // Si cambió a "close-music", ocultar el panel
    else if (newConfig === 'close-music') {
      notificationWindow.hide();
    }
  });

  ipcMain.on("get-song", (song) => {
    console.log("get-song", song);
    notificationWindow.webContents.send("get-song-test", song);
  });

  ipcMain.on("play--song", () => {
    notificationWindow.webContents.send("play-song");
  });

  ipcMain.on("pause--song", () => {
    notificationWindow.webContents.send("pause-song");
  });

  ipcMain.on("play-pause", () => {
    mainWindow.webContents.send("play-pause");
  });

  ipcMain.on("next", () => {
    mainWindow.webContents.send("next");
    ipcMain.send("next");
  });

  ipcMain.on("prev", () => {
    mainWindow.webContents.send("prev");
    ipcMain.send("prev");
  });

  ipcMain.on("update-song-time", (event, time) => {
    if (notificationWindow) {
      notificationWindow.webContents.send("update-song-time", time);
    }
  });

  ipcMain.on("change-lang", (event, lang) => {
    selectLangWindow.close();
    app.relaunch();
    app.exit();
  });

  ipcMain.on("reload-app", () => {
    if (mainWindow) {
      mainWindow.reload();
    }
    if (notificationWindow) {
      notificationWindow.reload();
    }
  });

  // Control de sincronización en progreso
  ipcMain.on("sync-started", () => {
    console.log('🔄 Sincronización iniciada - bloqueando cierre de aplicación');
    syncInProgress = true;
  });

  ipcMain.on("sync-finished", () => {
    console.log('✅ Sincronización completada - permitiendo cierre de aplicación');
    syncInProgress = false;
  });
}

module.exports = {
  getWindow,
  createWindow,
  destroyWindow,
};
