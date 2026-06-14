# USB Protocol — Attack Shark X11

Reverse-engineered HID protocol documentation for the Attack Shark X11 mouse.
Covers everything confirmed working, what is dangerous, and how to use each command.

> **Before sending any new payload to the mouse:** read the [Safety](#8-safety) section and the [Unpairing Incident](#unpairing-incident) in the history.

---

## Index

1. [Hardware and Identification](#1-hardware-and-identification)
2. [HID Transport](#2-hid-transport)
3. [Report 0x04 — DPI + Lighting](#3-report-0x04--dpi--lighting)
4. [Report 0x05 — Animation Mode](#4-report-0x05--animation-mode)
5. [Report 0x06 — Polling Rate](#5-report-0x06--polling-rate)
6. [Input Events (Interrupt 0x83)](#6-input-events-interrupt-0x83)
7. [Mandatory Flow](#7-mandatory-flow)
8. [Safety](#8-safety)
9. [Investigation History](#9-investigation-history)

---

## 1. Hardware and Identification

| Field | Value |
|---|---|
| Vendor ID | `0x1d57` |
| Product ID (2.4 GHz / dongle) | `0xfa60` |
| Product ID (wired USB) | `0xfa55` |
| USB Interface | `2` (`DEVICE_INTERFACE = 0x02`) |
| Input endpoint (interrupt) | `0x83` (`INTERRUPT_ENDPOINT`) |

The mouse works in two connection modes: **wireless** via 2.4 GHz dongle (`0xfa60`) and **wired** via USB cable (`0xfa55`). The protocol is identical in both cases; only the `idProduct` detection differs.

---

## 2. HID Transport

All commands are sent via **HID Feature Report** using `controlTransfer`:

```
bmRequestType = 0x21   (Host → Device, Class, Interface)
bRequest      = 0x09   (SET_REPORT)
wValue        = 0x03XX (0x03 = Feature Report; XX = Report ID)
wIndex        = 0x0002 (Interface 2 — the only one that accepts)
data          = report payload (see sections below)
```

> `wIndex=0` and `wIndex=1` return `LIBUSB_ERROR_IO`. Always use `wIndex=2`.

---

## 3. Report 0x04 — DPI + Lighting

**56-byte** (`0x38`) report. Controls DPI, per-stage colors, and a one-shot confirmation animation.

### Full layout

```
Byte  Value     Description
──────────────────────────────────────────────────────────
 00   0x04      Report ID
 01   0x38      Size (56)
 02   0x01      Fixed
 03   angleSnap 0x00 = off · 0x01 = on
 04   ripple    0x01 = on · 0x00 = off
 05   0x3f      Fixed (purpose unknown)
 06   stageMask high byte (0x20 if DPI stage 6 > 12000)
 07   stageMask low byte  (0x20 by default)
08–13 DPI[1–6]  DPI stages encoded (DPI_STEP_MAP)
14–15 0x00      Fixed
16–21 highFlags 0x01 if DPI > 12000 (per-stage flags)
22–23 0x00      Fixed
 24   stage     Active stage (1–6, 1-indexed)

25–27 RGB[1]    Stage 1 color (R, G, B)
28–30 RGB[2]    Stage 2 color
31–33 RGB[3]    Stage 3 color
34–36 RGB[4]    Stage 4 color
37–39 RGB[5]    Stage 5 color
40–42 RGB[6]    Stage 6 color
43–45 RGB[7]    Extra (purpose unknown)
46–48 RGB[8]    Extra (purpose unknown)

 49   anim      One-shot animation (see table below)
50–51 checksum  uint16 big-endian, sum of bytes 3–49
52–55 0x00      Padding (wireless mode only)
```

### Per-stage colors

The LED shows the color of the **active stage** (`byte[24]`). Each block is 3 bytes (R, G, B):

| Stage | Offsets |
|-------|---------|
| 1 | 25–27 |
| 2 | 28–30 |
| 3 | 31–33 |
| 4 | 34–36 |
| 5 | 37–39 |
| 6 | 40–42 |

Brightness is controlled by the **RGB value magnitude** — low values (e.g. `0x08`) produce a noticeably dimmer LED than `0xff`.

### One-shot animation (byte 49)

Triggered the moment the firmware receives the report. After the animation, the LED turns off. For continuous lighting, send Report `0x05` afterwards.

| byte 49 | Behavior |
|---------|----------|
| `0x00` | No animation — turns off immediately |
| `0x01` | ~3 quick blinks, then off |
| `0x02` | Solid ~3s, then off |
| others | Off (firmware ignores) |

> Use `0x00` when you want continuous lighting via `0x05` (avoids the confirmation flash).

### Checksum

```
checksum = sum(bytes[3..49]) & 0xffff
bytes[50] = (checksum >> 8) & 0xff   // high byte
bytes[51] =  checksum & 0xff         // low byte
```

### Example payload

Active stage 2, default palette, no one-shot animation:
```
04 38 01 00 01 3f 20 20 12 25 38 4b 75 81 00 00
00 00 00 00 00 01 00 00 02 ff 00 00 00 ff 00 00
00 ff ff ff 00 00 ff ff ff 00 ff ff 40 00 ff ff
ff 00 0f 68 00 00 00 00
```

---

## 4. Report 0x05 — Animation Mode

**15-byte** (`0x0f`) report. Controls the **continuous** lighting mode (does not turn off after the animation).

**Mandatory prerequisite**: Report `0x04` must be sent **before** this one. The firmware ignores `0x05` if `0x04` was never received.

### Full layout

```
Byte  Value        Description
──────────────────────────────────────────────────────────────────
 00   0x05         Report ID
 01   0x0f         Size (15)
 02   0x01         Fixed
 03   lightMode    Lighting mode (see table)
 04   ledSpeed     Speed — hardware uses inverted scale: 6 - uiSpeed
                   UI 1 (slow) → hw 5 · UI 5 (fast) → hw 1
 05   0xa8         deepSleepTime = 10 min (only confirmed working value)
 06   R            Global color — red
 07   G            Global color — green
 08   B            Global color — blue
 09   0x01         sleepTime = 0.5 min (only confirmed working value)
 10   keyResponse  Debounce in ms (4–50 ms, even values only)
 11   count        count(ch ≥ 0x64) + 1 if BreathingDpi
 12   checksum     sum(bytes[3..10]) & 0xff
 13   0x00         Wireless padding
 14   0x00         Wireless padding
```

### Lighting modes (byte 3)

| Value | Mode | Behavior |
|-------|------|----------|
| `0x00` | Off | LED off |
| `0x10` | Static | Solid fixed color (uses RGB bytes 6–8) |
| `0x20` | Breathing | Pulses the global color (bytes 6–8) |
| `0x30` | Neon | Cycles through rainbow with fade |
| `0x40` | ColorBreathing | Breathing while cycling colors |
| `0x50` | StaticDpi | Solid color of active stage (from `0x04`) |
| `0x60` | BreathingDpi | Breathing in active stage color (from `0x04`) |

> `Static` / `Breathing` / `Neon` / `ColorBreathing` use RGB from bytes 6–8.
> `StaticDpi` / `BreathingDpi` ignore bytes 6–8 and use stage colors from `0x04`.

### Checksum

```
checksum = sum(bytes[3..10]) & 0xff
bytes[12] = checksum
```

> `deepSleepTime` and `sleepTime` are hardcoded (`0xa8` = 10 min, `0x01` = 0.5 min). Other values broke lighting modes in tests — **do not change**.

---

## 5. Report 0x06 — Polling Rate

**9-byte** report. Format:

```
06 09 01 [rate] [checksum] 00 00 00 00
```

| Rate | `[rate]` byte | Checksum (`0xff - rate`) |
|------|--------------|--------------------------|
| 125 Hz | `0x08` | `0xf7` |
| 250 Hz | `0x04` | `0xfb` |
| 500 Hz | `0x02` | `0xfd` |
| 1000 Hz | `0x01` | `0xfe` |

Checksum = one's complement: `checksum = 0xff - rate`.

---

## 6. Input Events (Interrupt 0x83)

The mouse sends spontaneous packets via endpoint `0x83`. All share the prefix `03 55`.

| Prefix | Byte [2] | Meaning | Data |
|--------|----------|---------|------|
| `03 55` | `0x40` | Battery level | byte[4] = 0–100 |
| `03 55` | `0x10` | DPI button pressed | byte[3] = stage 1–6 |

Battery packet example: `03 55 40 01 64` → 100%.
DPI change example: `03 55 10 03 00` → stage 3.

---

## 7. Mandatory Flow

To configure DPI + continuous lighting, the order is:

```
1. DpiBuilder       → report 0x04  (DPI + per-stage colors)
                                    ↓ wait 300ms
2. UserPrefsBuilder → report 0x05  (animation mode + global color + speed)
```

The 300ms delay between `0x04` and `0x05` is required — the firmware needs time to process the first before accepting the second.

For polling rate: `PollingRateBuilder` → report `0x06` (can be sent independently).

For button remapping: `MacrosBuilder` → report `0x04` with macro payload (via `setMacro()`).

---

## 8. Safety

### Dangerous Report IDs

| Report ID | Status | Reason |
|-----------|--------|--------|
| `0x04` | ✅ Safe | DPI, colors — confirmed extensively |
| `0x05` | ✅ Safe | Continuous animation, after `0x04` |
| `0x06` | ✅ Safe | Polling rate — confirmed |
| `0x0b` | ⛔ DANGEROUS | Caused 2.4 GHz dongle unpairing |
| others | ⚠️ Unknown | Never tested — do not use without reason |

### Golden rules

1. **Never use a Report ID other than `0x04`, `0x05`, or `0x06`** without explicit approval.
2. **Always recalculate the checksum** when modifying any byte.
3. **Minimal variations**: when testing a hypothesis, change the fewest bytes possible from a known-good payload.
4. **Never change `wIndex`** — only `wIndex=2` is valid.
5. **Test via cable** (`0xfa55`) when possible: if something goes wrong, no RF pairing is lost.

### Recovery procedure (unpairing)

If the 2.4 GHz dongle loses pairing:

1. Turn the mouse off (physical switch).
2. Turn it back on.
3. Hold the **DPI button** (bottom of the mouse) until the dongle LED stops blinking.

The hardware does not suffer permanent damage — the mouse firmware is resilient.

---

## 9. Investigation History

Chronological record of how the above results were reached.

### Initial state

The vendored driver (`src/main/driver/`, fork of HarukaYamamoto0) had a `UserPreferencesBuilder` (report `0x05`, 15 bytes) that produced no effect on the LED — the mouse always stayed in factory "blue breathing" mode. DPI, polling rate, and macros worked perfectly (same transport layer, different builders).

### Phase 1 — `wIndex` diagnosis

Tested `wIndex=0,1,2` with the `UserPreferencesBuilder` payload:
- `wIndex=0` and `1` → `LIBUSB_ERROR_IO`.
- `wIndex=2` → returned OK, no LED effect.

Confirmed `wIndex=2` is the correct interface.

### Phase 2 — Report ID scan

Keeping `wIndex=2`, varied the Report ID from `0x01` to `0x0c`:
- `0x01`–`0x0a`, `0x0c`: no effect.
- **`0x0b`**: LED turned green briefly then turned off completely.

### Unpairing incident

Continuing to explore `0x0b` and other IDs (Static+Red payload, IDs `0x01`–`0x0f`), the 2.4 GHz dongle **lost pairing**. Diagnosis: dongle still visible via `lsusb` (hardware intact), mouse responded via cable (firmware intact). Recovery successful via manual procedure (hold DPI button).

**Conclusion**: Report ID `0x0b` appears to be a system command (e.g. "reset RF channel" or "factory pairing reset"), not a persistent configuration command.

### Phase 3 — External research (libratbag)

Found [libratbag#1807](https://github.com/libratbag/libratbag/issues/1807), independent reverse engineering via Wireshark + official Windows software. Confirmed:
- Report `0x04` (56 bytes) controls DPI **and** RGB zones (bytes 20–30 in the issue, corresponding to offsets 25–42 in our builder).
- Report `0x06` (9 bytes) controls polling rate.

### Phase 4 — RGB layout confirmation (script diag-rgb-safe.js)

Varied colors in blocks of report `0x04`:
- Block 1 (offsets 25–27): changed to purple — no visible effect (active stage was 2).
- **Block 2 (offsets 28–30): changed to turquoise `5be3d2` → LED displayed turquoise. CONFIRMED.**

Definitive proof: block N → color of stage N. Offset = `25 + (N-1)*3`.

### Phase 5 — Byte 49 and one-shot modes (script diag-rgb-mode.js)

Varied byte 49 (`0x00`–`0x08` and high values):
- `0x00`: off.
- `0x01`: ~3 blinks, then off.
- `0x02`: solid ~3s, then off.
- others: off.

Conclusion: byte 49 only controls the confirmation animation — no value produces a continuous effect.

### Phase 6 — Breakthrough: report `0x05` works (script diag-report03-05.js)

Decisive test: send `0x04` **first**, then `0x05` immediately.

Result: all modes (`0x10` Static, `0x20` Breathing, `0x30` Neon, `0x40` ColorBreathing, `0x50` StaticDpi, `0x60` BreathingDpi) worked with continuous animation.

`ledSpeed` confirmed inverted: UI 1 (slow) → hardware 5, UI 5 (fast) → hardware 1.

Root cause of the original problem: `0x05` was sent before `0x04`. The firmware requires initialization via `0x04` before accepting animation commands.

---

## References

- Base driver: [HarukaYamamoto0/attack-shark-x11-driver](https://github.com/HarukaYamamoto0/attack-shark-x11-driver) (MIT)
- Fork with fixes: [dressedinblack5/attack-shark-x11-electron](https://github.com/dressedinblack5/attack-shark-x11-electron) (MIT)
- Independent reverse engineering: [libratbag/libratbag#1807](https://github.com/libratbag/libratbag/issues/1807)
- Official manual (pairing procedure): [manuals.plus](https://manuals.plus/m/b7d8ea1afd8e24ebb87e01493bba8a35c7ef27cd3551737ffe4a9a2e81f1818c)
