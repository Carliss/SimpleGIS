const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron')
const Store = require('./store.js');
const defaultMenu = require('electron-default-menu');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow
let createTypeWindow
let geoprocessingTypeWindow
let geometryTypeWindow
let dataWindow
let project_name = 'project_Default.json'

// Store class with projects
const store = new Store({
    configName: project_name,
    defaults: {
        windowBounds: { width: 1200, height: 800 },
        vue: {
            layers: {},
            actions: {
                Point: 0,
                Line: 0,
                Polygon: 0,
            },
            geoprocessing: {
                Buffer: 0,
                Union: 0,
                Difference: 0,
                Intersect: 0,
                Clip: 0,
            },
            geometry: {
                Voronoi: 0,
                Tin: 0,
                Center: 0,
                Translate: 0,
                PointsWithinPolygon: 0,
                LineIntersect: 0,
                ShortestPath: 0,
            },
            analysis: {
                Area: 0,
                Bearing: 0,
                Distance: 0,
                Length: 0,
            },
        }
    }
});

function createWindow() {
    let { width, height } = store.get(project_name, 'windowBounds');
    mainWindow = new BrowserWindow({
        width: width,
        height: height,
        title: 'SimpleGIS',
        webPreferences: {
            nodeIntegration: true
        },
        icon: __dirname + '/Icons/icons8-map-marker-100.png.ico',
    })
    mainWindow.loadFile('index.html')
    // update store on rezise
    mainWindow.on('resize', () => {
        let { width, height } = mainWindow.getBounds();
        store.set(project_name, 'windowBounds', { width, height });
    });
    // send stored data
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('store:state', store.get(project_name, 'vue'));
    });

    // Emitted when the window is closed.
    mainWindow.on('closed', function () {
        app.quit();
    })
}

ipcMain.on('store:save', (e, vue) => {
    store.set(project_name, 'vue', vue);
    mainWindow.webContents.send('store:update');
})
ipcMain.on('store:save_to', (e, path) => {
    store.save_to(path);
    mainWindow.webContents.send('store:update');
})
ipcMain.on('store:load', (e, project) => {
    project_name = project.name;
    store.load_project(project_name, project.data);
    mainWindow.webContents.send('store:state', store.get(project_name, 'vue'));
})
ipcMain.on('store:delete', (e, name) => {
    store.delete_project(name);
    mainWindow.webContents.send('store:update');
})
ipcMain.on('store:project', (e, name) => {
    if (!name.startsWith('project_')) {
        name = 'project_' + name
    }
    project_name = name
    mainWindow.webContents.send('store:state', store.get(project_name, 'vue'));
})


// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
    // build menu bar
    const menu = defaultMenu(app, shell);
    Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
    // start main window
    createWindow()
})
// Quit when all windows are closed.
app.on('window-all-closed', function () {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') app.quit()
})
app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) createWindow()
})

// Handle add item window
function createCreateWindow() {
    createTypeWindow = new BrowserWindow({
        width: 500,
        height: 400,
        title: 'Add Layer'
    });
    createTypeWindow.loadFile('add/create.html')
    // Handle garbage collection
    createTypeWindow.on('close', function () {
        createTypeWindow = null;
    });
}
ipcMain.on('create:open', function (e, properties) {
    createCreateWindow();
    createTypeWindow.webContents.on('did-finish-load', () => {
        createTypeWindow.webContents.send('create:type', properties);
    });
});
ipcMain.on('layer:add_new', function (e, properties) {
    mainWindow.webContents.send('add_layer', properties);
    createTypeWindow.close()
});
ipcMain.on('create:close', () => {
    createTypeWindow.close();
})

// Handle geoprocessing item window
function geoprocessingWindow(type) {
    geoprocessingTypeWindow = new BrowserWindow({
        width: 500,
        height: 400,
        title: 'geoprocessing',
        webPreferences: {
            nodeIntegration: true,
        },
    });
    geoprocessingTypeWindow.loadFile(`geoprocessing/${type}.html`)
    // Handle garbage collection
    geoprocessingTypeWindow.on('close', function () {
        geoprocessingTypeWindow = null;
    });
}
ipcMain.on('geoprocessing:open', function (e, properties) {
    geoprocessingWindow(properties.type.toLowerCase());
    geoprocessingTypeWindow.webContents.on('did-finish-load', () => {
        geoprocessingTypeWindow.webContents.send('geoprocessing:type', properties);
    });
});
ipcMain.on('geoprocessing:add_new', function (e, properties) {
    mainWindow.webContents.send('add_layer', properties);
    geoprocessingTypeWindow.close()
});
ipcMain.on('geoprocessing:close', () => {
    geoprocessingTypeWindow.close();
})

// Handle geometry item window
function geometryWindow(type) {
    geometryTypeWindow = new BrowserWindow({
        width: 500,
        height: 500,
        title: 'geometry',
        webPreferences: {
            nodeIntegration: true,
        },
    });
    geometryTypeWindow.loadFile(`geometry/${type}.html`)
    // Handle garbage collection
    geometryTypeWindow.on('close', function () {
        geometryTypeWindow = null;
    });
}
ipcMain.on('geometry:open', function (e, properties) {
    geometryWindow(properties.type.toLowerCase());
    geometryTypeWindow.webContents.on('did-finish-load', () => {
        geometryTypeWindow.webContents.send('geometry:type', properties);
    });
});
ipcMain.on('geometry:add_new', function (e, properties) {
    mainWindow.webContents.send('add_layer', properties);
    geometryTypeWindow.close()
});
ipcMain.on('geometry:close', () => {
    geometryTypeWindow.close();
})

// Handle analysis item window
function analysisWindow(type) {
    analysisTypeWindow = new BrowserWindow({
        width: 500,
        height: 400,
        title: 'analysis',
        webPreferences: {
            nodeIntegration: true,
        },
    });
    analysisTypeWindow.loadFile(`analysis/${type}.html`)
    // Handle garbage collection
    analysisTypeWindow.on('close', function () {
        analysisTypeWindow = null;
    });
}
ipcMain.on('analysis:open', function (e, properties) {
    analysisWindow(properties.type.toLowerCase());
    analysisTypeWindow.webContents.on('did-finish-load', () => {
        analysisTypeWindow.webContents.send('analysis:type', properties);
    });
});
ipcMain.on('analysis:add_new', function (e, properties) {
    mainWindow.webContents.send('add_layer', properties);
    analysisTypeWindow.close()
});
ipcMain.on('analysis:close', () => {
    analysisTypeWindow.close();
})

// Handle data item window
function createDataWindow(type) {
    dataWindow = new BrowserWindow({
        width: 700,
        height: 800,
        title: 'analysis',
        webPreferences: {
            nodeIntegration: true,
        },
    });
    dataWindow.loadFile('data.html')
    // Handle garbage collection
    dataWindow.on('close', function () {
        dataWindow = null;
    });
}
ipcMain.on('data:open', function (e, data) {
    createDataWindow();
    dataWindow.webContents.on('did-finish-load', () => {
        dataWindow.webContents.send('data:type', data);
    });
});
ipcMain.on('data:close', () => {
    dataWindow.close();
})
