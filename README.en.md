# KSMARJAA TOOLS AI

[Bahasa Indonesia](README.md) · **English**

**Check product photo folders, save the products that are ready, and generate catalog images in batches.** KSMARJAA TOOLS AI is a Windows desktop app for preparing product images and tracking generation jobs in one place.

[![MIT License](https://img.shields.io/badge/license-MIT-8b2040)](LICENSE) ![Windows x64](https://img.shields.io/badge/platform-Windows%20x64-24569c) ![Source version](https://img.shields.io/badge/version-0.3.12-555555)

**[Quick start](#quick-start)** · **[How it works](#how-it-works)** · **[Build from source](#build-from-source)** · **[API integration (Indonesian)](docs/api-auth-check.md)**

## ✨ Features

| Menu | What you can do |
| --- | --- |
| 📂 **Folder analysis** | Scan subfolders, search for products, and see which folders are ready or need changes. |
| 📋 **Manifest** | Save and open a list of ready products. Search products, inspect details, or open a manifest in Generate. |
| 🎨 **Generate** | Choose a store, check readiness, run jobs in batches, and track progress. Pause or resume the queue and save results to a folder of your choice. |
| 🕓 **Activity log** | Review results and errors, search or filter entries, and export JSON. |
| ⚙️ **Settings** | Configure batch size, delays, retries, automatic downloads, theme, language, and animations. |

<a id="quick-start"></a>

## 🚀 Quick start

1. Launch the Windows desktop app. To build a local copy, follow [Build from source](#build-from-source).
2. Open **Folder analysis**, select a product folder, and start the scan. Review any products flagged for missing or invalid titles or photos.
3. Save the manifest. Open it from **Manifest** and choose the action to use it in **Generate**.
4. In **Generate**, select a store and review readiness and the output folder before starting. Generate requires access to the Rizky Moto AI service. Folder analysis, manifest creation, and building from source work without service access.
5. Track the active batch, saved results, and errors in **Generate** and the **Activity log**.

To enable extra animations, choose the **Full** animation option in the output and appearance settings.

<a id="how-it-works"></a>

## 🧭 How it works

### 1. Scan folders and validate products

Use photos you own and keep the filenames shown below. The names are part of the scanner's input format.

```text
Sample Products/
└── YAMAHA/
    └── MIO M3/
        └── TAMENG KNALPOT/
            └── 2 PCS/
                ├── JUDUL PRODUK.txt
                ├── FOTO PRODUK.jpg
                └── CONTOH FOTO PRODUK TERPASANG.jpg
```

- Each folder containing `JUDUL PRODUK.txt` counts as one product. The legacy filename `judul.txt` still works. The app reads the full title in UTF-8, UTF-16 with a BOM, or Windows-1252.
- A product needs a valid title and at least one reference photo named `FOTO PRODUK` or `CONTOH FOTO PRODUK TERPASANG`. If the only photo shows the part installed, the app uses it once as the main reference.
- Supported formats are JPG, JPEG, PNG, and WebP, up to 10 MB per file. The scanner checks file headers and flags missing titles, missing photos, ambiguous duplicate photos, and invalid formats.
- Brand, motorcycle, part, quantity, and model come from the folder path. The scan runs locally and skips hidden folders, symbolic links, and the `Hasil Generate` output folder.

### 2. Save a manifest

A manifest is a JSON file listing ready products, their titles, folder-derived identifiers, and relative paths to source photos. The desktop app saves it to `[source folder]/.moto-studio/manifest.json` using a temporary file. The analysis summary still records folders that need attention. Original photos and older dated manifests remain available.

### 3. Check readiness and start Generate

- Select a manifest and store. The app automatically picks an active template from the store catalog.
- The readiness panel checks source photos, catalog and template availability, service access, the output folder, and the saved queue state.
- The app processes up to 30 products per batch, depending on your settings. After the active batch finishes, it waits for the configured delay before advancing. You can inspect another batch while the active one continues.
- The service returns a job ID. The app then polls for progress. Progress percentages come from the service, while the finish time is estimated locally.

### 4. Recover a queue safely

| Situation | What the app does |
| --- | --- |
| **Queue paused or stopped, or app closed** | Preserve local state and check jobs with existing IDs when you resume. Jobs already accepted may continue on the server. |
| **Server rate limit** | Pace catalog, generation, status, and download requests and respect the server's retry delay. |
| **Submission interrupted before an ID arrived** | Mark the attempt as ambiguous. Check the website's job history before preparing another submission to avoid duplicate jobs. |
| **Job failed** | Show the reason in the queue or activity log. You can manually prepare the failed product for another attempt. |

### 5. Save the results

With automatic downloads enabled, the app fetches the images after each job finishes, limits the download size, and validates the file format. It keeps the original download in internal storage and compresses the output to **under 2,000,000 bytes**. The default destination is `[source folder]/Hasil Generate/[store]/[product path]/`. You can choose a different output folder in Generate.

> **Local data and service access.** Folder analysis runs on your device. Generate sends the necessary reference photos and job data to Rizky Moto AI. Service credentials are stored in Windows Credential Manager. For endpoint, status, and rate-limit details, see the [API integration guide in Indonesian](docs/api-auth-check.md).

<a id="build-from-source"></a>

## 🛠️ Build from source

**Windows x64 prerequisites**

- Node.js 24 with npm, and Git.
- Stable Rust with the MSVC toolchain.
- Visual Studio 2022 Build Tools with **Desktop development with C++** and the Windows SDK.
- Microsoft Edge WebView2 Runtime to launch the desktop app.

```powershell
git clone https://github.com/ksmaajr/ksmarjaa-tools-ai.git
cd ksmarjaa-tools-ai
npm ci
npm run tauri dev
```

For a browser preview, run `npm run dev` and open `http://127.0.0.1:1420`. Use the Tauri desktop app to test Windows dialogs, credential storage, and native file access.

**Run tests and build Windows packages**

```powershell
npm run build
npm test
npx playwright install chromium
npx playwright test
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm run tauri build -- --bundles nsis
```

The build places the executable at `src-tauri/target/release/ksmarjaa-tools-ai.exe` and the installer under `src-tauri/target/release/bundle/nsis/`. This repository contains source and documentation. Building requires no service credentials.

**Version 0.3.12 verification.** TypeScript, Vite, 16 unit tests, five Playwright scenarios, and the Windows x64 NSIS build have passed. End-to-end generation with a user account remains unverified.

## 🗂️ Source layout

| Path | Responsibility |
| --- | --- |
| [`src/scanner.ts`](src/scanner.ts) | Scan folders, validate products, and produce manifest data. |
| [`src/generate-view.ts`](src/generate-view.ts) | Check readiness, schedule batches, track jobs, and recover the queue. |
| [`src-tauri/src/`](src-tauri/src/) | Handle native file access, storage, credentials, and service integration. |
| [`tests/`](tests/) | Cover user flows with Playwright. |
| [`docs/api-auth-check.md`](docs/api-auth-check.md) | Document the API contract and service behavior in Indonesian. |

## 📄 License and contributions

The source is available under the [MIT License](LICENSE). Third-party dependencies retain their own licenses. For bug reports, open a [GitHub issue](https://github.com/ksmaajr/ksmarjaa-tools-ai/issues) with your Windows version, steps to reproduce, and expected result. Use sample data you can share. Code changes are welcome via pull requests.
