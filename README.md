# Defense of Hogwarts

A local-only browser game with an operator console, live leaderboard, and two independent phone-controller modes. The game runs on the laptop/projector; a phone can send controller input over the same local network.

## Requirements

- Node.js 18 or newer and npm.
- Windows PowerShell for the setup commands below.
- `mkcert` for the local HTTPS certificate. Install with `choco install mkcert` or `scoop install mkcert`.

## First-time setup

1. From the project directory, install the local certificate authority and locate its root certificate:

   ```powershell
   mkcert -install
   mkcert -CAROOT
   ```

2. Find the laptop's current Ethernet/USB-tethering IPv4 address with `ipconfig`. Set it in the current PowerShell session, then generate a certificate for that address and localhost. Replace `(ETHERNET-IPV4)` with the actual IPv4 address for this command; it is a documentation placeholder, not a literal hostname.

   ```powershell
   $env:HOST_IP = "<actual Ethernet IPv4>"
   New-Item -ItemType Directory -Force certs
   mkcert -cert-file certs/laser-fruit-slash.pem -key-file certs/laser-fruit-slash-key.pem localhost 127.0.0.1 ::1 $env:HOST_IP
   ```

3. Install dependencies and start the local HTTPS server:

   ```powershell
   npm install
   npm start
   ```

   The server requires both certificate files and will stop with an error if either is missing. It does not fall back to HTTP. The server listens on all network interfaces; `HOST_IP` is used for the displayed LAN address. The default HTTPS port is `3000`; set `HTTPS_PORT` before startup if needed.

## Pages and URLs

The default port is `3000`. The server serves the following routes:

| Page | LAN URL | Laptop URL |
|---|---|---|
| Game | `https://(ETHERNET-IPV4):3000/game` | `https://localhost:3000/game` |
| Admin | `https://(ETHERNET-IPV4):3000/admin` | `https://localhost:3000/admin` |
| Leaderboard | `https://(ETHERNET-IPV4):3000/leaderboard` | `https://localhost:3000/leaderboard` |
| Camera / Red Tracker Controller | `https://(ETHERNET-IPV4):3000/controller` | `https://localhost:3000/controller` |
| Touch-Screen Controller | `https://(ETHERNET-IPV4):3000/controller/touch.html` | `https://localhost:3000/controller/touch.html` |

If `HTTPS_PORT` is changed, replace `3000` in the URLs with the configured port. The LAN placeholder is for documentation and startup display only; use the laptop's actual reachable Ethernet IPv4 address on the phone.

### Choose a controller mode

- **Camera / Red Tracker Mode** (`/controller`): uses the phone camera, camera permission, calibration, and red-laser tracking.
- **Touch-Screen Mode** (`/controller/touch.html`): sends direct touchscreen swipe input and does not use the camera or laser detection.

Keep the Game page open on the laptop/projector, and open the chosen controller URL on the phone. For phone access, use the laptop's reachable Ethernet IPv4 address, not `localhost`—`localhost` on a phone refers to the phone itself. The phone and laptop must be able to communicate over the network, the firewall must permit the configured port, and the browser must trust the HTTPS certificate. For camera mode, Chrome also needs camera permission.

### Trust the certificate on Android

1. Run `mkcert -CAROOT` on the laptop and copy only `rootCA.pem` from that directory to the phone.
2. In Android Settings, search for **Install certificate** or **Install from device storage** and install it as a **CA certificate**. Labels vary by device.
3. Never copy or share `rootCA-key.pem`; it is the private CA key. Some managed devices prohibit user-installed certificates.
4. Fully close and reopen Chrome after installing the certificate.

## Run a round

1. Open the Game and Admin pages on the laptop.
2. Open one of the two controller modes on the phone and confirm the controller connection in Admin.
3. Start a round from Admin. Medium difficulty is fixed; the round duration is configured in Admin.
4. The player selects a Hogwarts faction on the game display, then swipes with the chosen controller to slash entities.
5. Submit the player's name from Admin after the round. The leaderboard is stored locally in `data/leaderboard.json`.

## Leaderboard deletion PIN

The server uses `ADMIN_PIN`, falling back to `274913` if the environment variable is unset. Change it in the PowerShell session before startup:

```powershell
$env:ADMIN_PIN = "your-new-six-digit-pin"
npm start
```

The PIN is used for destructive leaderboard actions. Keep it private. Back up `data/leaderboard.json` before making manual changes.

## Troubleshooting

| Symptom | Action |
|---|---|
| HTTPS certificate files missing | Generate the certificate and key using the setup steps above; confirm both files exist in `certs/`. |
| Certificate authority is not trusted | Install `rootCA.pem` on the phone as a CA certificate, then restart Chrome. |
| Certificate is invalid for the LAN address | Generate a certificate including the laptop's current IPv4 address. Keep `HOST_IP` aligned with that address. |
| Phone cannot connect | Confirm the server is running, use the laptop's actual LAN address and configured port, and check network access and Windows Firewall. |
| Controller disconnects | Reload the selected controller page and check that the secure WebSocket connection is not blocked. |
| Camera access or tracking fails | Use the Camera / Red Tracker URL over trusted HTTPS, grant camera permission, recalibrate the board corners, and reduce red reflections. Touch-Screen Mode does not require camera access. |
| Port is already in use | Set `HTTPS_PORT` to an available port before startup and update the URLs accordingly. |

The project is intended for local use only; no deployment configuration is provided.
