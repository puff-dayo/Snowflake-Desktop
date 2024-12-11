import { app, BrowserWindow, screen, Tray, Menu, nativeImage } from "electron";
import * as path from "path";
import { exec } from 'child_process';
import os from 'os';
import { dialog } from "electron/main";

if (require('electron-squirrel-startup')) app.quit();

let refreshRate: number = 60;
let tray;
const icon = nativeImage.createFromPath(path.join(__dirname, '../icon.png'));


function createWindow() {
    const display = screen.getPrimaryDisplay();
    const workArea = display.workArea;

    let factor = display.scaleFactor;
    const [x, y] = [workArea.width, workArea.height];
    const [px, py] = [workArea.x, workArea.y];

    const mainWindow = new BrowserWindow({
        width: x / factor,
        height: y / factor,

        alwaysOnTop: true,
        frame: false,
        transparent: true,
        skipTaskbar: true,

        icon: icon,

        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            zoomFactor: 1.0 / factor,
        },
    });

    mainWindow.setPosition(px, py)
    mainWindow.setIgnoreMouseEvents(true)
    mainWindow.loadFile(path.join(__dirname, "../index.html"));

    // mainWindow.webContents.openDevTools({
    //     mode: "detach",
    // });
    mainWindow.webContents.setFrameRate(refreshRate)
}

async function getMonitorFrameRate() {
    const platform = os.platform();

    return new Promise((resolve, reject) => {
        if (platform === 'win32') {
            // Windows: Use WMIC
            exec('wmic path Win32_VideoController get CurrentRefreshRate', (err, stdout) => {
                if (err) {
                    reject('Error fetching refresh rate on Windows');
                } else {
                    const match = stdout.match(/\d+/);
                    if (match) {
                        resolve(parseInt(match[0], 10));
                    } else {
                        reject('Could not determine refresh rate on Windows.');
                    }
                }
            });
        } else if (platform === 'linux') {
            // Linux: Use xrandr
            exec('xrandr | grep "*" | cut -d" " -f4', (err, stdout) => {
                if (err) {
                    reject('Error fetching refresh rate on Linux');
                } else {
                    const rate = parseFloat(stdout.trim());
                    if (!isNaN(rate)) {
                        resolve(rate);
                    } else {
                        reject('Could not determine refresh rate on Linux.');
                    }
                }
            });
        } else if (platform === 'darwin') {
            // macOS: Use system_profiler
            exec('system_profiler SPDisplaysDataType | grep Resolution', (err, stdout) => {
                if (err) {
                    reject('Error fetching refresh rate on macOS');
                } else {
                    const match = stdout.match(/(\d+) Hz/);
                    if (match) {
                        resolve(parseInt(match[1], 10));
                    } else {
                        reject('Could not determine refresh rate on macOS.');
                    }
                }
            });
        } else {
            reject('Unsupported OS for refresh rate detection.');
        }
    });
}

async function fallbackEstimateFrameRate() {
    return new Promise((resolve) => {
        let frameCount = 0;
        let startTime = performance.now();

        function measure() {
            frameCount++;
            const now = performance.now();
            if (now - startTime >= 1000) {
                resolve(frameCount);
            } else {
                requestAnimationFrame(measure);
            }
        }

        measure();
    });
}

async function fetchRefreshRate() {
    try {
        const rate = await getMonitorFrameRate();
        if (typeof rate === "number") {
            refreshRate = rate;
        } else {
            throw new Error();
        }
    } catch (err) {
        try {
            const fallbackRate = await fallbackEstimateFrameRate();
            if (typeof fallbackRate === "number") {
                refreshRate = fallbackRate;
            } else {
                throw new Error();
            }
        } catch (fallbackErr) {
            refreshRate = 60;
        }
    }
}

app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-software-rasterizer');

app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');

app.commandLine.appendSwitch('use-gl', 'desktop');
app.commandLine.appendSwitch('enable-features', 'Vulkan');

app.whenReady().then(async () => {
    tray = new Tray(icon);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'About',
            click: () => {
                dialog.showMessageBox({
                    type: 'info',
                    title: 'Snowflakes Desktop',
                    message: 'Snowflakes Desktop\nVersion 2024.12\n',
                    detail: 'A simple snowflake animation application.\nby Setsuna (puff-dayo)',
                    buttons: ['OK!']
                });
            }
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                app.quit();
            }
        }
    ])

    tray.setContextMenu(contextMenu);
    tray.setToolTip('Snowflakes desktop - a simple animation app');
    tray.setTitle('Snowflakes');

    await fetchRefreshRate();
    createWindow();

    app.on("activate", function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});
