# Integrasi API Rizky Moto AI

Website tetap: `https://rizkymotoshop.my.id`. Pengguna cukup memasukkan API key dari Settings → API Keys di website. Host dan jalur API ada di `src/api-contract.json`, digunakan bersama oleh frontend dan Rust. Versi 0.2.1 memigrasi URL/endpoint versi sebelumnya ke kontrak tetap. Key domain lain tidak dipindahkan atau diteruskan.

Sumber: branch `feature/api-key-generation-integration`, commit `3dc813c7a79123db71728bceb5be1bfed92eb7f2`; docs/image-api.md, routes/api.php, ImageGenerationController, AuthenticateImageApiKey, ApiKey, ApiKeys, OpenAiImageService, GeneratedImageDownloadController, dan GenerateOpenAiImageJob. Branch main belum memuat fitur ini. Branch feat/secure-image-api-gateway memuat API prompt JSON yang berbeda dan tidak dipakai tools ini.

## Tes API key

Satu GET ke `/api/v1/catalog/stores` dengan Accept application/json dan Authorization Bearer. HTTP 200 harus berisi `data` berupa daftar toko; daftar kosong tetap berarti key diterima. Respons 401 menunjukkan key salah/kedaluwarsa/dicabut; 403 menunjukkan izin images:generate tidak tersedia. Redirect, HTML login, JSON yang tidak sesuai, 404, 429, dan gangguan server tidak dinyatakan sukses. Tidak mengirim gambar, membuat generation, atau mengirim key acak. Tes menampilkan toko yang diizinkan key, termasuk jika key dibatasi pada satu toko.

Prefix key website `rms_live_`. Key provider Vercel/OpenAI tetap di server. Key Windows disimpan di Windows Credential Manager, bukan settings.json atau manifest. Backend mengirim key hanya ke host tetap. Preview browser menyimpan key dalam memori sesi dan memerlukan CORS; backend Rust Windows tidak bergantung CORS browser.

Website produksi sudah diperiksa tanpa key: GET katalog menghasilkan HTTP 401 JSON Unauthenticated. Tes key asli belum dilakukan karena tidak ada key pengguna yang diberikan.

## Endpoint Generate

| Tujuan | Method dan path |
|---|---|
| Toko | GET /api/v1/catalog/stores |
| Template | GET /api/v1/catalog/stores/{store}/templates |
| Model provider | GET /api/v1/catalog/models |
| Kirim produk | POST /api/v1/images/generations |
| Progres/hasil | GET /api/v1/images/generations/{generation} |
| Unduh asli | GET /api/v1/images/generations/{generation}/images/{image} |
| Batalkan queued/pending | POST /api/v1/images/generations/{generation}/cancel |

POST memakai multipart: store_id, template_id, product_image, installed_image opsional, custom_title, model opsional, image_count 1–4. Foto maksimal 10 MB per file. Logo/prompt template diselesaikan server. Respons 202 menyertakan id/status_url: pekerjaan diterima, bukan gambar selesai. Lifecycle: queued, processing, completed, failed, cancelled; cancel juga menerima pending. Judul custom disimpan dalam requested_custom_title dan dibaca worker. Bug judul lama sudah diperbaiki pada branch ini.

Dokumentasi menulis batas judul 120 karakter, tetapi controller dan normalizeCustomTitle pada commit ini tidak lagi membatasi atau memotong judul. Implementasi adalah acuan untuk judul utuh.

## Rate limit dan retry

Default per key 60 request/menit. Katalog, polling, download, dan generation semuanya melewati middleware dan memakai kuota. Route juga memakai throttle 120/menit. Scheduler perlu menghormati Retry-After serta mengatur gabungan operasi, termasuk polling, bukan batch saja.

Belum ditemukan Idempotency-Key atau lookup client_request_id. Timeout POST dapat terjadi setelah generation tercipta, sehingga retry buta bisa membuat pekerjaan ganda. Integrasi perlu menangani status ambigu. Respons 503 dispatch gagal dapat menyertakan generation_id; simpan ID sebelum tindak lanjut. Job worker memiliki tries=1; retry tools dan worker berbeda.

## Kompresi lokal yang disepakati

API showImage mengirim file asli. Kompresi <=2 MB berada di GeneratedImageDownloadController pada route web yang memakai autentikasi sesi; Bearer tidak otomatis dapat memakai route itu.

Alur Generate desktop: unduh file asli ke area kerja lokal → kompres lokal → periksa ukuran aktual → simpan hasil ke `[folder dipilih]/Hasil Generate/[nama toko]/[jalur produk]`. Nama mengikuti opsi judul custom. Simpan atomik agar file parsial tidak dianggap selesai. File asli tidak ditimpa; backup asli di area internal agar folder output utama berisi hasil akhir.

Prioritas pilihan pengguna: ukuran di bawah 2 MB, tampilan sedekat mungkin dengan asli. Coba lossless dahulu, lalu kualitas encoding bertahap pada dimensi asli, dan perkecil dimensi hanya bila masih diperlukan. Hasil harus benar-benar kurang dari 2.000.000 byte (batas ketat di bawah 2 MB). Catat ukuran asli/akhir, format, dan perubahan dimensi. Piksel identik tidak dijamin jika lossy/resize diperlukan.
