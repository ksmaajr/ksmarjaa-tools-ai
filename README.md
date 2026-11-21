# KSMARJAA TOOLS AI

**Bahasa Indonesia** · [English](README.en.md)

**Rapikan folder foto produk, simpan daftar siap kerja, lalu jalankan Generate dalam batch.** KSMARJAA TOOLS AI adalah aplikasi desktop Windows untuk menyiapkan foto katalog produk dan memantau proses Generate dari satu tempat.

[![Lisensi MIT](https://img.shields.io/badge/lisensi-MIT-8b2040)](LICENSE) ![Windows x64](https://img.shields.io/badge/platform-Windows%20x64-24569c) ![Versi sumber](https://img.shields.io/badge/versi-0.3.12-555555)

**[Mulai pakai](#-mulai-pakai)** · **[Cara kerja](#-cara-kerja)** · **[Build dari source](#-build-dari-source)** · **[Integrasi API](docs/api-auth-check.md)**

## ✨ Fitur

| Menu | Yang bisa dikerjakan |
| --- | --- |
| 📂 **Analisis folder** | Pindai subfolder, cari produk, dan lihat folder mana yang siap atau perlu perbaikan. |
| 📋 **Manifest** | Simpan dan buka daftar produk siap proses. Cari produk, cek detail, atau buka manifest langsung di Generate. |
| 🎨 **Generate** | Pilih toko, cek kesiapan, jalankan antrean per batch, dan pantau progres. Jeda atau lanjutkan antrean, lalu simpan hasil ke folder tujuan. |
| 🕓 **Log aktivitas** | Lihat hasil proses dan kesalahan. Gunakan pencarian, filter kategori atau status, dan ekspor JSON. |
| ⚙️ **Pengaturan** | Atur batch, jeda, percobaan ulang, unduh otomatis, tema Light atau Dark, bahasa, dan animasi. |

## 🚀 Mulai pakai

1. Jalankan aplikasi desktop Windows. Untuk membuat paket lokal, ikuti [Build dari source](#-build-dari-source).
2. Pilih **Analisis folder → Pilih folder → Mulai analisis**. Periksa daftar **Perlu perbaikan** jika ada judul atau foto yang belum lengkap.
3. Klik **Simpan manifest**. Buka menu **Manifest**, pilih daftar tadi, lalu klik **Gunakan manifest ini** untuk meneruskannya ke Generate.
4. Di **Generate**, pilih toko, periksa panel kesiapan dan folder output, lalu mulai antrean. Fitur Generate memerlukan akses ke layanan Rizky Moto AI. Analisis, pembuatan manifest, dan build bisa dilakukan tanpa akses tersebut.
5. Pantau batch aktif, hasil tersimpan, dan kendala melalui **Generate** dan **Log aktivitas**.

Untuk animasi tambahan, pilih **Pengaturan → Hasil & Tampilan → Animasi → Penuh**.

## 🧭 Cara kerja

### 1. Analisis folder dan validasi produk

Gunakan pola folder ini dengan foto milik Anda sendiri:

```text
Contoh Produk/
└── YAMAHA/
    └── MIO M3/
        └── TAMENG KNALPOT/
            └── 2 PCS/
                ├── JUDUL PRODUK.txt
                ├── FOTO PRODUK.jpg
                └── CONTOH FOTO PRODUK TERPASANG.jpg
```

- Satu folder dengan `JUDUL PRODUK.txt` dihitung sebagai satu produk. Nama lama `judul.txt` tetap diterima. Judul dibaca utuh dari teks UTF-8, UTF-16 dengan BOM, atau Windows-1252.
- Produk siap jika judul valid dan terdapat minimal satu foto referensi bernama `FOTO PRODUK` atau `CONTOH FOTO PRODUK TERPASANG`. Jika hanya foto terpasang yang tersedia, aplikasi menggunakannya sebagai referensi utama satu kali.
- Foto JPG, JPEG, PNG, dan WebP didukung hingga 10 MB per file. Aplikasi memeriksa format dari header file. Judul kosong, foto hilang, foto ganda yang ambigu, dan format yang tidak valid muncul sebagai masalah.
- Merek, motor, komponen, jumlah, dan model diambil dari jalur folder. Pemindaian berjalan lokal dan melewati folder tersembunyi, tautan simbolis, serta `Hasil Generate`.

### 2. Simpan manifest

Manifest adalah file JSON berisi produk siap proses, judul, identitas dari folder, dan path relatif ke foto sumber. Desktop menyimpannya ke `[folder sumber]/.moto-studio/manifest.json` melalui file sementara. Folder yang perlu diperbaiki tetap tercatat dalam ringkasan analisis. Foto asli dan manifest lama bertanggal tetap tersedia.

### 3. Periksa kesiapan dan jalankan Generate

- Pilih manifest dan toko. Template aktif dipilih otomatis dari katalog toko.
- Panel kesiapan memeriksa foto sumber, katalog dan template, akses layanan, folder hasil, serta status pemulihan antrean.
- Produk diproses per batch, hingga 30 produk per batch sesuai pengaturan. Setelah batch aktif selesai, aplikasi menunggu jeda yang ditentukan sebelum melanjutkan. Memilih batch untuk ditinjau tidak mengubah batch yang sedang berjalan.
- Layanan mengembalikan ID pekerjaan, kemudian aplikasi memantau progresnya. Persentase berasal dari layanan. Waktu selesai yang tampil adalah perkiraan lokal.

### 4. Lanjutkan antrean dengan aman

| Situasi | Yang dilakukan aplikasi |
| --- | --- |
| **Dijeda, dihentikan, atau aplikasi ditutup** | Simpan status lokal. Saat pengguna melanjutkan, cek kembali pekerjaan yang sudah memiliki ID. Pekerjaan yang sudah diterima server bisa tetap berjalan di sana. |
| **Server membatasi permintaan** | Atur laju permintaan katalog, Generate, polling, dan unduhan serta ikuti jeda yang diminta server. |
| **Respons kirim terputus tanpa ID** | Tandai status ambigu. Periksa riwayat di website sebelum menyiapkan pengiriman ulang agar produk tidak diproses ganda. |
| **Pekerjaan gagal** | Tampilkan alasan di antrean atau Log aktivitas. Produk yang gagal bisa disiapkan ulang melalui aksi manual. |

### 5. Simpan hasil

Jika unduh otomatis aktif, aplikasi mengambil gambar setelah pekerjaan selesai, membatasi ukuran unduhan, dan memeriksa format file. Gambar asli unduhan dicadangkan di area internal, lalu hasil dikompresi hingga **di bawah 2.000.000 byte**. Lokasi default adalah `[folder sumber]/Hasil Generate/[toko]/[jalur produk]/`. Anda bisa memilih folder output sendiri di Generate.

> **Data lokal dan layanan.** Analisis folder berlangsung di perangkat. Saat Generate dijalankan, foto referensi dan data pekerjaan yang diperlukan dikirim ke layanan Rizky Moto AI. Kredensial layanan disimpan di Windows Credential Manager. Detail request, status, dan batas layanan tersedia di [panduan integrasi API](docs/api-auth-check.md).

## 🛠️ Build dari source

**Prasyarat di Windows x64**

- Node.js 24 dengan npm dan Git.
- Rust stable dengan toolchain MSVC.
- Visual Studio 2022 Build Tools dengan **Desktop development with C++** dan Windows SDK.
- Microsoft Edge WebView2 Runtime untuk menjalankan aplikasi desktop.

```powershell
git clone https://github.com/ksmaajr/ksmarjaa-tools-ai.git
cd ksmarjaa-tools-ai
npm ci
npm run tauri dev
```

Untuk melihat frontend di browser, jalankan `npm run dev` dan buka `http://127.0.0.1:1420`. Gunakan aplikasi Tauri untuk mencoba dialog Windows, penyimpanan kredensial, dan akses file native.

**Tes dan build paket Windows**

```powershell
npm run build
npm test
npx playwright install chromium
npx playwright test
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm run tauri build -- --bundles nsis
```

Executable lokal tersedia di `src-tauri/target/release/ksmarjaa-tools-ai.exe`, dan installer di `src-tauri/target/release/bundle/nsis/`. Repositori ini berisi source code dan dokumentasi. Build tidak membutuhkan kredensial layanan.

**Status versi 0.3.12:** TypeScript, Vite, 16 tes unit, lima skenario Playwright, dan build NSIS x64 telah diverifikasi. Generate dengan akun pengguna masih belum diuji end-to-end.

## 🗂️ Struktur kode

| Lokasi | Tanggung jawab |
| --- | --- |
| [`src/scanner.ts`](src/scanner.ts) | Pindai folder, validasi produk, dan susun data manifest. |
| [`src/generate-view.ts`](src/generate-view.ts) | Cek kesiapan, jadwalkan batch, pantau progres, dan pulihkan antrean. |
| [`src-tauri/src/`](src-tauri/src/) | Akses file Windows, penyimpanan, kredensial, dan integrasi layanan. |
| [`tests/`](tests/) | Tes alur pengguna dengan Playwright. |
| [`docs/api-auth-check.md`](docs/api-auth-check.md) | Kontrak endpoint dan catatan perilaku layanan. |

## 📄 Lisensi dan kontribusi

Source code tersedia di bawah [lisensi MIT](LICENSE). Dependensi pihak ketiga mengikuti lisensi masing-masing. Untuk melaporkan masalah, buka [GitHub Issues](https://github.com/ksmaajr/ksmarjaa-tools-ai/issues) dengan versi Windows, langkah reproduksi, dan hasil yang diharapkan. Gunakan contoh data yang bisa dibagikan. Perubahan kode bisa diajukan lewat pull request.
