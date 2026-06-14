import { app, shell, BrowserWindow, ipcMain, nativeTheme, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { homedir } from 'os'

// ─── driver ──────────────────────────────────────────────────────────────────
import * as usb from 'usb'
import { AttackSharkX11 } from './driver/src/core/AttackSharkX11.js'
import { ConnectionMode } from './driver/src/types.js'
import { DpiBuilder } from './driver/src/protocols/DpiBuilder.js'
import { MacrosBuilder, macroTemplates, type MacroTuple, FirmwareAction, Modifiers } from './driver/src/protocols/MacrosBuilder.js'
import { PollingRateBuilder, Rate } from './driver/src/protocols/PollingRateBuilder.js'
import { CustomMacroBuilder, MacroMode } from './driver/src/protocols/CustomMacroBuilder.js'
import { LedMode, type RgbColor } from './driver/src/types.js'
import { UserPreferencesBuilder, LightMode } from './driver/src/protocols/UserPreferencesBuilder.js'

// ─── persistência ─────────────────────────────────────────────────────────────
const CFG = join(homedir(), '.config', 'opensharkx11')
mkdirSync(CFG, { recursive: true })
const STATE_FILE = join(CFG, 'state.json')
const PROFILES_FILE = join(CFG, 'profiles.json')

function loadJson<T>(f: string, fb: T): T {
  try { if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8')) } catch {}
  return structuredClone(fb)
}
const save = (f: string, d: unknown) => writeFileSync(f, JSON.stringify(d, null, 2))

// ─── fila segura (min 300ms entre comandos USB) ───────────────────────────────
const SAFE_DELAY = 300
let driver: AttackSharkX11 | null = null
let queue: Promise<unknown> = Promise.resolve()
let mainWin: BrowserWindow | null = null
let tray: Tray | null = null
let appIsQuitting = false
let currentConnMode: 'wireless' | 'wired' | null = null

function run<T>(fn: () => Promise<T>): Promise<T> {
  const t = queue.then(fn)
  queue = t.catch(() => {})
  return t
}

// ─── bateria do mouse ────────────────────────────────────────────────────────
let mouseBattery = -1  // -1=desconhecido; 0-100 = percentual
let batteryPollTimer: ReturnType<typeof setInterval> | null = null

type BatteryOverride = { mode: LightMode; rgb: RgbColor; ledSpeed: 1|2|3|4|5 } | null

function batteryOverrideForLevel(pct: number): BatteryOverride {
  if (pct < 0 || pct > 100) return null
  if (pct < 15) return { mode: LightMode.Breathing, rgb: {r:0xff,g:0x00,b:0x00}, ledSpeed: 5 }
  if (pct < 30) return { mode: LightMode.Breathing, rgb: {r:0xff,g:0x80,b:0x00}, ledSpeed: 2 }
  return null
}

// ─── tipos e estado ───────────────────────────────────────────────────────────
const BUTTON_KEYS = ['left','right','middle','forward','backward','dpi','scrollUp','scrollDown']
const BTN_ENUM: Record<string, number> = {
  left:0, right:1, middle:2, forward:3, backward:4, dpi:5, scrollUp:6, scrollDown:7
}
const RATE_MAP: Record<number, Rate> = {
  125: Rate.powerSaving, 250: Rate.office, 500: Rate.gaming, 1000: Rate.eSports
}

type Binding = { type: string; template?: string; modifiers?: number; keyCode?: number }
interface AppState {
  dpi: { values: [number,number,number,number,number,number]; activeStage: number; angleSnap: boolean; rippleControl: boolean }
  pollingRate: number
  lighting: {
    mode: LightMode;
    stageColors: [RgbColor,RgbColor,RgbColor,RgbColor,RgbColor,RgbColor];
    globalColor: RgbColor;
    ledSpeed: 1|2|3|4|5;
  }
  performance: { keyResponse: number }
  power: { sleepTime: number; deepSleepTime: number }
  buttons: Record<string, Binding>
  customMacro: { enabled: boolean; targetButton: number; mode: number; repeat: number; events: {key:number;delay:number;release:boolean}[] }
}

const DEFAULT_STATE: AppState = {
  dpi: { values: [800,1600,2400,3200,5000,22000], activeStage: 2, angleSnap: false, rippleControl: true },
  pollingRate: 1000,
  lighting: {
    mode: LightMode.BreathingDpi,
    stageColors: [
      {r:0xff,g:0x00,b:0x00},
      {r:0x00,g:0xff,b:0x00},
      {r:0x00,g:0x00,b:0xff},
      {r:0xff,g:0xff,b:0x00},
      {r:0x00,g:0xff,b:0xff},
      {r:0xff,g:0x00,b:0xff},
    ] as [RgbColor,RgbColor,RgbColor,RgbColor,RgbColor,RgbColor],
    globalColor: {r:0x00,g:0xff,b:0x00},
    ledSpeed: 3,
  },
  performance: { keyResponse: 8 },
  power: { sleepTime: 0.5, deepSleepTime: 10 },
  buttons: {
    left:    { type:'template', template:'global-left-click' },
    right:   { type:'template', template:'global-right-click' },
    middle:  { type:'template', template:'global-middle' },
    forward: { type:'template', template:'global-forward' },
    backward:{ type:'template', template:'global-backward' },
    dpi:     { type:'template', template:'global-dpi-cycle' },
    scrollUp:{ type:'template', template:'global-scroll-up' },
    scrollDown:{ type:'template', template:'global-scroll-down' },
  },
  customMacro: { enabled: false, targetButton: 4, mode: 0, repeat: 1, events: [] }
}

let state: AppState = loadJson(STATE_FILE, DEFAULT_STATE)
// garantir que campos novos existem se state estava desatualizado
state = { ...DEFAULT_STATE, ...state, buttons: { ...DEFAULT_STATE.buttons, ...state.buttons } }
// migração: garante todos os campos de lighting existem
if (!Array.isArray((state.lighting as any).stageColors) || !('globalColor' in state.lighting)) {
  state.lighting = { ...DEFAULT_STATE.lighting, ...state.lighting }
}
if (!(state.lighting as any).globalColor) state.lighting.globalColor = DEFAULT_STATE.lighting.globalColor
if (!(state.lighting as any).ledSpeed) state.lighting.ledSpeed = DEFAULT_STATE.lighting.ledSpeed
// migração: força sleepTime/deepSleepTime para valores confirmados funcionais
// (deepSleepTime=30 era o padrão antigo e quebra todos os modos de luz)
if (state.power.deepSleepTime !== 10) state.power = { sleepTime: 0.5, deepSleepTime: 10 }

let profiles: Record<string, AppState> = loadJson(PROFILES_FILE, {})

// ─── helpers do driver ────────────────────────────────────────────────────────
function bindingToTuple(b: Binding): MacroTuple {
  if (b.type === 'keyboard') {
    return [FirmwareAction.KEYBOARD, (b.modifiers ?? 0) as Modifiers, b.keyCode ?? 0] as const
  }
  const tpl = macroTemplates[b.template as keyof typeof macroTemplates]
  if (!tpl) throw new Error(`Template desconhecido: ${b.template}`)
  return tpl
}

async function applyLightingOnly(d: AttackSharkX11, cfg: AppState) {
  const stage = (Math.min(5, Math.max(0, cfg.dpi.activeStage)) + 1) as 1|2|3|4|5|6
  const override = batteryOverrideForLevel(mouseBattery)
  const effectiveMode = override?.mode ?? cfg.lighting.mode

  await d.setDpi(new DpiBuilder({
    dpiValues: cfg.dpi.values,
    activeStage: stage,
    angleSnap: cfg.dpi.angleSnap,
    ripplerControl: cfg.dpi.rippleControl,
    stageColors: cfg.lighting.stageColors,
    ledMode: LedMode.Off,
  }))

  // Aguardar firmware processar 0x04 antes de enviar 0x05
  await new Promise<void>(r => setTimeout(r, SAFE_DELAY))

  await d.setUserPreferences(new UserPreferencesBuilder({
    lightMode: effectiveMode,      // 0x00=Off; firmware pode aceitar como desligar LED
    rgb: override?.rgb ?? cfg.lighting.globalColor,
    ledSpeed: override?.ledSpeed ?? cfg.lighting.ledSpeed,
    keyResponse: cfg.performance.keyResponse as never,
    sleepTime: 0.5,                // hard-coded: único valor confirmado funcional
    deepSleepTime: 10,             // hard-coded: único valor confirmado funcional
  }))
}

async function applyAll(d: AttackSharkX11, cfg: AppState) {
  await applyLightingOnly(d, cfg)

  await d.setPollingRate(new PollingRateBuilder({
    rate: RATE_MAP[cfg.pollingRate] ?? Rate.eSports
  }))

  const mb = new MacrosBuilder()
  for (const key of BUTTON_KEYS) {
    const b = cfg.buttons[key]
    if (b) mb.setMacro(BTN_ENUM[key] as never, bindingToTuple(b))
  }
  console.log('[macro] enviando mapeamento de botões:', mb.toString())
  await d.setMacro(mb)
  console.log('[macro] setMacro OK')

  // macro custom opcional
  const m = cfg.customMacro
  if (m.enabled && m.events.length > 0) {
    const mb2 = new MacrosBuilder()
    for (const key of BUTTON_KEYS) {
      const b = cfg.buttons[key]; if (b) mb2.setMacro(BTN_ENUM[key] as never, bindingToTuple(b))
    }
    const cb = new CustomMacroBuilder()
      .setPlayOptions(m.mode as MacroMode, m.repeat)
      .setTargetButton(m.targetButton, mb2)
    for (const ev of m.events) cb.addEvent(ev.key, ev.delay, ev.release)
    await d.setCustomMacro(cb)
  }
}

// ─── system tray ─────────────────────────────────────────────────────────────
function trayIconPath(): string {
  return is.dev
    ? join(__dirname, '../../assets/icons/24x24.png')
    : join(process.resourcesPath, 'assets', 'icons', '24x24.png')
}

// BGRA byte triplets for battery bar colors
const BAR_COLORS = {
  usb:     [0xff, 0x00, 0xc8] as const, // #c800ff magenta
  charged: [0x76, 0xe6, 0x00] as const, // #00e676 green
  high:    [0x76, 0xe6, 0x00] as const, // #00e676 green  >= 50%
  mid:     [0x00, 0x98, 0xff] as const, // #ff9800 orange >= 15%
  low:     [0x6b, 0x3f, 0xf4] as const, // #f43f6b red    < 15%
}

function makeTrayIcon(connected: boolean, battery = -1, usbMode = false): Electron.NativeImage {
  const img = nativeImage.createFromPath(trayIconPath())
  const resized = img.resize({ width: 22, height: 22 })
  const size = resized.getSize()
  const W = size.width, H = size.height
  const buf = Buffer.from(resized.toBitmap()) // raw BGRA on all platforms

  if (!connected) {
    for (let i = 0; i < buf.length; i += 4) {
      const gray = Math.round(0.299 * buf[i + 2] + 0.587 * buf[i + 1] + 0.114 * buf[i])
      buf[i] = gray; buf[i + 1] = gray; buf[i + 2] = gray
    }
    return nativeImage.createFromBitmap(buf, size)
  }

  // battery bar: 1px separator + 3px fill at bottom
  const BAR_H = 3
  const SEP_ROW = H - BAR_H - 1
  const usbCharged = usbMode && battery >= 95

  let barColor: readonly [number, number, number]
  let fillW: number
  if (usbMode) {
    barColor = usbCharged ? BAR_COLORS.charged : BAR_COLORS.usb
    fillW = W // always full width when USB (charging/charged)
  } else if (battery < 0) {
    return nativeImage.createFromBitmap(buf, size) // no battery info yet
  } else {
    barColor = battery >= 50 ? BAR_COLORS.high : battery >= 15 ? BAR_COLORS.mid : BAR_COLORS.low
    fillW = Math.max(1, Math.round(W * battery / 100))
  }

  for (let row = SEP_ROW; row < H; row++) {
    for (let col = 0; col < W; col++) {
      const idx = (row * W + col) * 4
      if (row === SEP_ROW) {
        // separator: darken existing pixel
        buf[idx] = Math.round(buf[idx] * 0.3)
        buf[idx + 1] = Math.round(buf[idx + 1] * 0.3)
        buf[idx + 2] = Math.round(buf[idx + 2] * 0.3)
      } else if (col < fillW) {
        buf[idx] = barColor[0]; buf[idx + 1] = barColor[1]; buf[idx + 2] = barColor[2]; buf[idx + 3] = 255
      } else {
        // unfilled portion: dim background
        buf[idx] = 25; buf[idx + 1] = 25; buf[idx + 2] = 25; buf[idx + 3] = 200
      }
    }
  }

  return nativeImage.createFromBitmap(buf, size)
}

function buildTrayMenu(connected: boolean) {
  return Menu.buildFromTemplate([
    {
      label: 'Show OpenSharkX11',
      click: () => { mainWin?.show(); mainWin?.focus() },
    },
    { type: 'separator' },
    {
      label: 'Search mouse',
      enabled: !connected,
      click: () => {
        mainWin?.show()
        mainWin?.focus()
        mainWin?.webContents.send('tray:search')
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => { appIsQuitting = true; app.quit() },
    },
  ])
}

function updateTray(connected: boolean, battery: number, usbMode: boolean) {
  if (!tray) return
  tray.setImage(makeTrayIcon(connected, battery, usbMode))
  tray.setContextMenu(buildTrayMenu(connected))

  let tooltip = 'OpenSharkX11'
  if (!connected) tooltip += ' · Disconnected'
  else if (usbMode) tooltip += ' · USB · Charging'
  else tooltip += battery >= 0 ? ` · ${battery}%` : ' · Connected'
  tray.setToolTip(tooltip)

  // título ao lado do ícone (visível em KDE / AppIndicator)
  tray.setTitle(connected && !usbMode && battery >= 0 ? ` ${battery}%` : '')
}

function createTray() {
  tray = new Tray(makeTrayIcon(false))
  updateTray(false, -1, false)
  tray.on('click', () => {
    if (mainWin?.isVisible() && mainWin?.isFocused()) {
      mainWin.hide()
    } else {
      mainWin?.show()
      mainWin?.focus()
    }
  })
}

// ─── janela ───────────────────────────────────────────────────────────────────
function createWindow(): void {
  nativeTheme.themeSource = 'dark'

  mainWin = new BrowserWindow({
    width: 1200, height: 860,
    minWidth: 960, minHeight: 720,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#070b10',
    show: false,
    autoHideMenuBar: true,
    icon: is.dev
      ? join(__dirname, '../../assets/icon.png')
      : join(process.resourcesPath, 'assets', 'icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
    },
  })

  mainWin.on('ready-to-show', () => mainWin!.show())

  mainWin.on('close', (e) => {
    if (!appIsQuitting) { e.preventDefault(); mainWin?.hide() }
  })

  mainWin.on('minimize', () => { mainWin?.hide() })

  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWin.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWin.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ─── IPC ──────────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  electronApp.setAppUserModelId('dev.clevs.opensharkx11')
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))
  createWindow()
  createTray()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // ── controles da janela ──
  ipcMain.on('win:minimize', () => mainWin?.minimize())
  ipcMain.on('win:maximize', () => mainWin?.isMaximized() ? mainWin!.unmaximize() : mainWin?.maximize())
  ipcMain.on('win:close',   () => mainWin?.close())

  // ── conexão ──
  // Tenta um modo específico; se não passado, tenta adapter depois wired
  ipcMain.handle('device:connect', async (_evt, preferredMode?: 'wireless' | 'wired') => {
    // fechar conexão anterior se existir
    if (driver) {
      try { await driver.close() } catch {}
      driver = null
    }

    // pre-check rápido: verifica visibilidade USB sem scan extra
    const all = usb.getDeviceList()
    if (all.length === 0) return { ok: false, error: 'Módulo USB nativo sem dispositivos — possível incompatibilidade de ABI.' }
    const shark = all.filter((d: any) => d.deviceDescriptor.idVendor === 0x1d57)
    if (shark.length === 0) return { ok: false, error: `Mouse não encontrado (${all.length} dispositivos USB detectados). Verifique se o mouse ou dongle está conectado.` }
    console.log(`[connect] ${shark.length} dispositivo(s) Attack Shark detectado(s)`)

    const modes: ConnectionMode[] = preferredMode === 'wired'
      ? [ConnectionMode.Wired, ConnectionMode.Adapter]
      : [ConnectionMode.Adapter, ConnectionMode.Wired]

    let lastError = ''
    for (const mode of modes) {
      try {
        console.log(`[connect] tentando modo ${mode === ConnectionMode.Adapter ? '2.4GHz' : 'USB'} (idProduct=0x${mode.toString(16)})...`)
        const d = new AttackSharkX11({ connectionMode: mode, delayMs: SAFE_DELAY })
        await d.open()
        driver = d
        mouseBattery = -1

        // Monitor de bateria — reage a mudanças e atualiza LED automaticamente
        driver.on('batteryChange', (bat: number) => {
          const prevOverride = batteryOverrideForLevel(mouseBattery)
          mouseBattery = bat
          mainWin?.webContents.send('mouse:battery', bat)
          updateTray(true, bat, currentConnMode === 'wired')
          if (JSON.stringify(batteryOverrideForLevel(bat)) !== JSON.stringify(prevOverride)) {
            run(() => applyLightingOnly(driver!, state))
          }
        })

        // Sincroniza estágio DPI ativo quando o botão físico é pressionado
        driver.on('dpiStageChange', (stage: number) => {
          console.log(`[dpi] estágio físico mudou para ${stage} (0-indexed)`)
          state.dpi.activeStage = stage
          save(STATE_FILE, state)
          mainWin?.webContents.send('mouse:dpiStage', stage)
        })

        // Detecta desconexão inesperada (mouse desligado / cabo removido)
        driver.on('error', (err: Error) => {
          console.warn('[usb] driver error — mouse desconectado:', err.message)
          if (batteryPollTimer) { clearInterval(batteryPollTimer); batteryPollTimer = null }
          mouseBattery = -1
          currentConnMode = null
          try { driver?.close() } catch {}
          driver = null
          mainWin?.webContents.send('mouse:disconnected')
          updateTray(false, -1, false)
        })

        // Leitura inicial + poll a cada 5 min (batteryChange pode não disparar sozinho)
        const pollBattery = async () => {
          if (!driver) return
          try {
            const bat = await driver.getBatteryLevel(2000)
            if (bat >= 0 && bat !== mouseBattery) driver.emit('batteryChange', bat)
          } catch {}
        }
        pollBattery()
        if (batteryPollTimer) clearInterval(batteryPollTimer)
        batteryPollTimer = setInterval(pollBattery, 5 * 60_000)

        const modeName = mode === ConnectionMode.Adapter ? 'wireless' : 'wired'
        currentConnMode = modeName
        console.log(`[connect] conectado via ${modeName}`)
        updateTray(true, mouseBattery, modeName === 'wired')

        // Aplicar configuração salva automaticamente ao conectar
        run(() => applyAll(d, state)).catch(e => console.warn('[connect] applyAll falhou:', e.message))

        return { ok: true, mode: modeName }
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
        console.warn(`[connect] falhou modo 0x${mode.toString(16)}:`, lastError)
      }
    }

    return { ok: false, error: lastError || 'Mouse não encontrado' }
  })

  ipcMain.handle('device:disconnect', async () => {
    if (batteryPollTimer) { clearInterval(batteryPollTimer); batteryPollTimer = null }
    mouseBattery = -1
    currentConnMode = null
    try { await driver?.close() } catch {}
    driver = null
    updateTray(false, -1, false)
    return { ok: true }
  })

  ipcMain.handle('device:battery', async () => {
    if (!driver) return null
    if (mouseBattery >= 0) return mouseBattery
    try { return await driver.getBatteryLevel(1500) } catch { return null }
  })

  // ── config ──
  ipcMain.handle('config:get', () => state)

  ipcMain.handle('config:apply', async (_evt, patch: Partial<AppState>) => {
    if (!driver) throw new Error('Mouse não conectado')
    const merged: AppState = {
      ...state,
      ...patch,
      buttons: { ...state.buttons, ...(patch.buttons ?? {}) },
      dpi: { ...state.dpi, ...(patch.dpi ?? {}) },
      lighting: { ...state.lighting, ...(patch.lighting ?? {}) },
      performance: { ...state.performance, ...(patch.performance ?? {}) },
      power: { ...state.power, ...(patch.power ?? {}) },
      customMacro: { ...state.customMacro, ...(patch.customMacro ?? {}) },
    }
    await run(() => applyAll(driver!, merged))
    state = merged
    save(STATE_FILE, state)
    return state
  })

  ipcMain.handle('config:reset', async () => {
    if (!driver) throw new Error('Mouse não conectado')
    await run(() => driver!.reset())
    state = structuredClone(DEFAULT_STATE)
    save(STATE_FILE, state)
    return state
  })

  // ── perfis ──
  const RESERVED = new Set(['__proto__', 'constructor', 'prototype'])
  const assertName = (name: unknown): string => {
    if (typeof name !== 'string' || !name.trim() || name.length > 64 || RESERVED.has(name))
      throw new Error('Nome de perfil inválido')
    return name.trim()
  }

  ipcMain.handle('profiles:list',   () => Object.keys(profiles))
  ipcMain.handle('profiles:save',   (_evt, name: unknown, cfg?: AppState) => {
    const n = assertName(name)
    profiles[n] = cfg ? { ...DEFAULT_STATE, ...cfg } : structuredClone(state)
    save(PROFILES_FILE, profiles)
    return Object.keys(profiles)
  })
  ipcMain.handle('profiles:load',   (_evt, name: unknown) => profiles[assertName(name)] ?? null)
  ipcMain.handle('profiles:delete', (_evt, name: unknown) => {
    const n = assertName(name)
    delete profiles[n]
    save(PROFILES_FILE, profiles)
    return Object.keys(profiles)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
  appIsQuitting = true
  tray?.destroy(); tray = null
  if (batteryPollTimer) { clearInterval(batteryPollTimer); batteryPollTimer = null }
  if (driver) { try { await driver.close() } catch {} finally { driver = null } }
})
