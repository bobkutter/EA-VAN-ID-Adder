const electron = require('electron')
const {app, BrowserWindow} = electron
const path = require('path')
const url = require('url')
const { ipcMain } = require('electron');

// Keep a global reference so the garbage collector does not destroy our app
let mainWindow

// Keep a global reference so we can pass info between windows
let passwordWindow

// Creates the main window.
function createMainWindow () {

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720
  })

  // Load the index.html file
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }))

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// Opens the password window
function openPasswordWindow() {

  passwordWindow = new BrowserWindow({
    parent: mainWindow,
    modal: true,
    show: false,
    width: 1000,
    height: 400
  })

  passwordWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'pwd.html'),
    protocol: 'file:',
    slashes: true
  }))

  passwordWindow.once('ready-to-show', () => {
    passwordWindow.show()
  })
}

// Attach event listener to event that requests to update something in the main window
// from the password window
ipcMain.on('request-update-label-in-second-window', (event, arg) => {
    // Request to update the label in the renderer process of the second window
    // We'll send the same data that was sent to the main process
    // Note: you can obviously send the
    mainWindow.webContents.send('action-update-label', arg);
});


// Create main and password windows when the app is ready
app.on('ready', () => {
  createMainWindow()
  openPasswordWindow()
  electron.powerMonitor.on('on-ac', () => {
    mainWindow.restore()
  })
  electron.powerMonitor.on('on-battery', () => {
    mainWindow.minimize()
  })
})

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Reopen the app on macOS
app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow()
    openPasswordWindow()
  }
})
