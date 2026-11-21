# KSMARJAA TOOLS AI

Aplikasi lokal Windows berbasis Tauri 2 dan TypeScript. Versi 0.3.12 mencakup Analisis folder, perpustakaan Manifest, Pengaturan, Log aktivitas, dan menu Generate. Sebelum mulai, Generate memeriksa manifest, foto dan format sumber, akses toko/template, API key, folder output, serta checkpoint antrean. Hasil unduhan dibatasi saat streaming dan divalidasi sebelum disimpan. Maksimum 30 produk per batch dikirim paralel sesuai Pengaturan; batch berikutnya menunggu semua hasil selesai, menampilkan hitung mundur jeda, lalu berjalan otomatis. Antrean bisa berpindah batch dan menyiapkan ulang produk gagal; generation ID, pilihan toko, dan lokasi output dipulihkan dari data aplikasi yang disimpan atomik. Tema Light/Dark, Bahasa Indonesia/English, gerakan antarmuka, opasitas panel, serta skala tampilan desktop 90% dapat disesuaikan. Semua menu menyediakan panduan kontekstual; Activity Log diberi warna sesuai level dan manifest dapat dihapus dengan konfirmasi. Lihat [panduan integrasi API](docs/api-auth-check.md) untuk detail pemulihan serta keamanan request.

Halaman Generate memakai tata letak premium yang dapat digulir tanpa memotong panel, animasi halus, pilihan template otomatis sesuai toko, ringkasan batch dan unduh otomatis dari Pengaturan, antrean per batch yang dapat digulir dan dipilih untuk meninjau batch lain tanpa mengubah batch yang berjalan, kontrol jeda/hentikan/lanjutkan, progres aktual dari website, estimasi lokal yang mengikuti progres tersebut, dan folder output custom dengan default di folder sumber. Preferensi reduced motion tetap dihormati.

## Mulai cepat

1. Jalankan aplikasi desktop Windows dan buka **Analisis folder**.
2. Pilih folder produk, jalankan analisis, lalu simpan manifest untuk produk yang siap.
3. Jika ingin memakai Generate, masukkan API key website melalui **Pengaturan → Koneksi API**, simpan, lalu uji koneksi.
4. Buka **Generate**, pilih manifest dan toko, lalu periksa panel kesiapan serta lokasi output sebelum memulai antrean. Cek progres dan riwayat di **Log aktivitas**.

Analisis folder berjalan secara lokal. Saat Generate dijalankan, aplikasi mengirim foto referensi dan data generation yang diperlukan ke API Rizky Moto AI. Pengujian lokal 0.3.12 mencakup TypeScript, build Vite, 16 unit test, lima alur Playwright, dan build Windows x64. Generate dengan API key pengguna belum diuji end-to-end.

## Pengembangan

Prasyarat Windows: Node.js dengan npm (build 0.3.12 menggunakan Node.js 24), Rust stable dengan target MSVC, Visual Studio C++ Build Tools dengan Windows SDK, dan Microsoft Edge WebView2 Runtime. Repositori source tidak memuat executable dan installer.

```powershell
npm ci
npm run tauri dev
```

Untuk memeriksa frontend dan build paket lokal:

```powershell
npm test
npx playwright install chromium
npx playwright test
npm run build
npm run tauri build -- --bundles nsis
```

| Folder | Isi |
| --- | --- |
| `src/` | Tampilan TypeScript/CSS, analisis folder, kontrak API, dan pengendali antrean |
| `src-tauri/` | Backend Rust, akses file, credential, request API, dan konfigurasi paket Windows |
| `tests/` | Pengujian alur pengguna di Playwright |
| `docs/` | Dokumentasi integrasi API |

## Menjalankan

- Aplikasi Windows: jalankan `ksmarjaa-tools-ai.exe` di folder `src-tauri/target/release` setelah build.
- Pengembangan: `npm install`, lalu `npm run tauri dev` (Rust stable MSVC dan Visual Studio C++ Build Tools diperlukan).
- Preview browser: `npm run dev`, buka `http://127.0.0.1:1420` melalui Chrome/Edge. Preview memakai pemilih folder browser, sehingga hanya menampilkan nama sumber, bukan path absolut Windows.
- Build installer dan executable: `npm run tauri build`.
- Unit test: `npm test`. Pengujian alur browser: `npx playwright test`.

## Aturan sumber

Pilih folder sumber, lalu klik **Mulai analisis**. Jumlah produk dihitung dari folder yang memiliki `JUDUL PRODUK.txt` (alias lama `judul.txt` tetap didukung), bukan dari jumlah foto. Judul dibaca utuh, mendukung UTF-8, UTF-16 dengan BOM, serta fallback Windows-1252. Huruf besar/kecil tidak berpengaruh.

Produk siap jika judul valid dan minimal satu foto referensi tersedia: `FOTO PRODUK` dan/atau `CONTOH FOTO PRODUK TERPASANG`. Nama lama `foto produk terpasang` tetap didukung. Foto menerima JPG, JPEG, PNG, WebP, maksimal 10 MB. Jika hanya foto terpasang yang tersedia, foto itu digunakan sebagai gambar utama dan referenceMode menjadi installed-only; file yang sama tidak diduplikasi ke slot kedua.

Identitas diambil dari jalur folder: merek (YAMAHA/HONDA dan merek yang didukung), jenis motor, part, jumlah/paket, dan model. Atribut yang tidak disebutkan pada folder tidak ditebak dari judul. Contoh YAMAHA/MIO M3/TAMENG KNALPOT/2 PCS/SLASH BIG HEAD menghasilkan brand YAMAHA, motorcycle MIO M3, part TAMENG KNALPOT, salesLabel 2 PCS, quantity 2, model SLASH BIG HEAD. 2 PCS tetap jenis pcs, tidak otomatis disamakan dengan paket/set. Konteks folder induk tetap dibaca dari path sumber desktop meskipun memilih subfolder.

Tidak ada pencocokan gambar atau panggilan AI. Pemeriksaan gambar hanya membaca 16 byte header. Folder `Hasil Generate`, folder tersembunyi, source aplikasi `moto-studio`, dan symbolic links dilewati. File sumber tidak dipindahkan, diubah, atau dihapus.

Judul kosong, foto tidak tersedia, foto ganda yang ambigu, atau gambar tidak valid membuat entri tersebut belum siap. Produk lain yang lengkap tetap bisa disimpan. Folder dengan foto tetapi tanpa file judul ditandai dan tidak dihitung sebagai produk. `FOTO PRODUK.txt` tidak ditebak sebagai judul. Struktur mentah lama dengan MODEL.txt belum didukung otomatis.

## Manifest

Manifest berisi hanya produk siap, disimpan ke `[folder sumber]/.moto-studio/manifest.json`. Folder belum lengkap dilewati dan jumlahnya ditampilkan sebelum simpan. Penyimpanan berikutnya memperbarui file yang sama, melalui file sementara dan rename di desktop. Manifest lama dengan nama bertanggal tidak dihapus dan tetap dapat dibuka. Path gambar relatif terhadap sourceRoot; judul custom disimpan utuh. `identity` mencatat atribut folder, `referenceMode` mencatat sumber foto, dan `analysisSummary` mencatat jumlah produk dari judul, produk siap, serta folder yang dilewati. Struktur sumber dipertahankan melalui folder/hierarchy. Pola hasil berikutnya `[sumber]/Hasil Generate/[toko]/[jalur produk]/[nama file]`.

Folder `Hasil Generate` dibuat saat hasil pertama disimpan. Daftar manifest disimpan lokal untuk dilihat kembali. Menu Manifest menampilkan tanggal, sumber, jumlah produk, tabel dengan pencarian dan pagination, serta dialog detail. Tombol Gunakan manifest ini memilihnya dan langsung membuka Generate. Generate menggunakan path dan foto yang terdaftar pada manifest, tanpa pemindaian ulang. Akses file dibatasi native backend ke folder sumber manifest dan path relatif yang tervalidasi; resume setelah restart tidak meminta izin ulang.

## Contoh folder

Gunakan gambar JPG yang Anda miliki dan buat file judul dengan teks biasa:

```text
Contoh Produk/
└── YAMAHA/
    └── MIO M3/
        └── TAMENG KNALPOT/
            └── 2 PCS/
                ├── JUDUL PRODUK.txt
                └── FOTO PRODUK.jpg
```

## Tampilan

Tema hitam transparan dengan aksen merah, efek acrylic Windows, dan monogram K. Nama aplikasi, judul jendela, metadata manifest, dan installer menggunakan KSMARJAA TOOLS AI. Tanpa thumbnail atau checkbox. Animasi transisi, hover, indikator scan, dan dialog mendukung preferensi reduced motion. Font dibundel lokal agar aplikasi tidak membutuhkan Google Fonts atau internet saat analisis.

Versi 0.2.3 memakai satu keluarga font Inter, judul 27–29 px, label/isi 12–13 px, serta keterangan 10–11 px. Bahasa antarmuka diringkas menjadi petunjuk tindakan tanpa slogan. Halaman analisis memakai tinggi jendela yang tersedia, dengan daftar produk dan panduan yang dapat digulir sendiri. Tombol analisis dan simpan memiliki area tetap.

## Pengaturan dan tes API key

Menu Pengaturan cukup meminta API key website. Alamat `https://rizkymotoshop.my.id` dan jalur API otomatis dari src/api-contract.json. Tes GET katalog toko mengikuti API sebenarnya dan menampilkan toko yang diizinkan key; tidak membutuhkan endpoint buatan authenticated:true. Tersedia request per batch, jeda batch, timeout, interval status, maksimal percobaan request/download, jeda awal/maksimum retry, jeda bertahap, download otomatis, penamaan judul custom, animasi, serta opasitas kaca. Simpan menerapkan perubahan tampilan; Batal mengembalikan nilai tersimpan; Reset proses mempertahankan API key. Foto sumber di atas 10 MB ditolak validasi, sesuai batas upload API.

Pada Windows, nilai biasa disimpan secara atomik ke `%APPDATA%/com.ksmarjaatools.desktop/settings.json`. API key disimpan terpisah di Windows Credential Manager dan diikat ke URL dasar website. Tes key membaca key tersimpan di backend, tanpa menampilkan ulang rahasianya. Mengisi key baru tidak menyimpan key sampai tombol Simpan ditekan. Penghapusan key juga menunggu Simpan. Kegagalan menulis pengaturan mengembalikan perubahan key jika memungkinkan dan melaporkan kegagalan.

Preview browser menyimpan pengaturan biasa di localStorage, tetapi key hanya dalam memori sesi. Reload preview menghapus key sementara. Aplikasi Windows menyimpan key antar-restart. Lihat [audit integrasi API](docs/api-auth-check.md): API tersedia pada branch feature/api-key-generation-integration. Menu Generate memakai endpoint tersebut; model tidak dikirim agar default website aktif yang digunakan. Status/persentase dibaca dari website; ETA merupakan perkiraan lokal dari progres aktual yang diterima. Hasil diunduh asli, dicadangkan internal, dikompresi, lalu disimpan kurang dari 2.000.000 byte.

## Layout, notifikasi, dan aktivitas

Pengaturan dibagi ke empat tab: Koneksi API, Pengiriman, Retry, serta Hasil & Tampilan. Nilai yang belum disimpan tetap dipertahankan saat pindah tab/halaman. Validasi membuka tab kolom yang bermasalah. Area isi dapat digulir sendiri, sementara judul jendela, navigasi, serta bar tindakan tetap memiliki ruang masing-masing. Bar simpan tidak mengambang di atas formulir. Layout diuji pada jendela 1440×900, 1366×768, dan 900×700.

Notifikasi melayang di kanan atas untuk sukses, gagal, peringatan, dan informasi. Maksimal tiga tampil sekaligus, bisa ditutup, berhenti menghitung waktu saat diarahkan mouse, dan memiliki tautan ke aktivitas. Notifikasi sukses hilang setelah 5 detik, peringatan 7 detik, kegagalan 9 detik. Preferensi reduced motion tetap dihormati.

Log Aktivitas menyimpan maksimal 2.000 entri di penyimpanan lokal WebView. Tersedia kategori, filter status, pencarian, halaman 25 entri, ekspor JSON, dan hapus dengan konfirmasi. Key tidak diberikan ke logger, dan pola key website/Bearer/key OpenAI yang dikenal disamarkan sebagai lapisan tambahan. Riwayat bertahan antar-restart. Waktu ditampilkan dalam Asia/Jakarta. Proses folder per file tidak membuat spam notifikasi.

Pengingat ringan seperti manifest belum tersedia, pembatalan perubahan, dan validasi isian hanya berupa popup. Hasil proses nyata tetap dicatat. Popup yang sama tidak ditumpuk; pesan ringan tidak menawarkan tautan ke log. Entri pengingat manifest dari versi lama juga disaring saat membaca riwayat.
