use std::{fs, io::{Read, Write}, path::{Component, Path, PathBuf}};

const MAX_SOURCE_IMAGE: u64 = 10 * 1024 * 1024;
const MAX_OUTPUT_IMAGE: usize = 2_000_000;

#[tauri::command]
pub fn generation_delete_manifest(source_root: String) -> Result<bool, String> {
    let root = canonical_source(&source_root)?;
    let directory = root.join(".moto-studio");
    let dir_meta = match fs::symlink_metadata(&directory) {
        Ok(meta) => meta,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(_) => return Err("Folder penyimpanan manifest tidak dapat diperiksa.".into()),
    };
    if dir_meta.file_type().is_symlink() || !dir_meta.is_dir() {
        return Err("Lokasi manifest bukan folder penyimpanan lokal yang aman.".into());
    }
    let canonical_dir = fs::canonicalize(&directory).map_err(|_| "Folder penyimpanan manifest tidak dapat dibuka.".to_string())?;
    if canonical_dir.parent() != Some(root.as_path()) {
        return Err("Folder manifest berada di luar folder sumber.".into());
    }
    let path = canonical_dir.join("manifest.json");
    let metadata = match fs::symlink_metadata(&path) {
        Ok(meta) => meta,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(_) => return Err("File manifest tidak dapat diperiksa.".into()),
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("File manifest bukan file lokal biasa; penghapusan dibatalkan.".into());
    }
    fs::remove_file(path).map_err(|_| "File manifest lokal tidak dapat dihapus. Tutup aplikasi lain yang sedang menggunakannya lalu coba lagi.".to_string())?;
    Ok(true)
}

fn canonical_source(root: &str) -> Result<PathBuf, String> {
    let root = fs::canonicalize(root).map_err(|_| "Folder sumber dari manifest tidak dapat diakses.".to_string())?;
    if !root.is_dir() { return Err("Lokasi sumber manifest bukan folder.".into()); }
    Ok(root)
}

fn relative_file(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let rel = Path::new(relative);
    if rel.as_os_str().is_empty() || rel.is_absolute() || rel.components().any(|part| !matches!(part, Component::Normal(_))) {
        return Err("Path foto di manifest tidak valid.".into());
    }
    let file = fs::canonicalize(root.join(rel)).map_err(|_| format!("Foto pada manifest tidak ditemukan: {relative}"))?;
    if !file.starts_with(root) || !file.is_file() { return Err("Foto pada manifest berada di luar folder sumber.".into()); }
    let size = fs::metadata(&file).map_err(|_| "Ukuran foto sumber tidak dapat diperiksa.".to_string())?.len();
    if size == 0 || size > MAX_SOURCE_IMAGE { return Err("Foto sumber kosong atau melebihi batas 10 MiB.".into()); }
    Ok(file)
}

pub fn image_format(bytes: &[u8]) -> Option<&'static str> {
    if bytes.len() >= 3 && bytes[..3] == [0xff, 0xd8, 0xff] { return Some("image/jpeg"); }
    if bytes.len() >= 8 && bytes[..8] == [137, 80, 78, 71, 13, 10, 26, 10] { return Some("image/png"); }
    if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" { return Some("image/webp"); }
    None
}

fn valid_image_header(path: &Path, bytes: &[u8]) -> bool {
    let expected = match path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        _ => return false,
    };
    image_format(bytes) == Some(expected)
}

fn safe_component(value: &str) -> Result<&str, String> {
    if value.is_empty() || value == "." || value == ".." || value.chars().any(|c| matches!(c, '/' | '\\' | ':') || c < ' ' || "<>\"|?*".contains(c)) {
        return Err("Nama folder atau file hasil tidak valid.".into());
    }
    Ok(value)
}

fn hierarchy(value: &str) -> Result<Vec<&str>, String> {
    let parts: Vec<_> = value.split('/').collect();
    if parts.is_empty() || parts.iter().any(|part| part.is_empty()) { return Err("Jalur produk pada manifest tidak valid.".into()); }
    for part in &parts { safe_component(part)?; }
    Ok(parts)
}

#[tauri::command]
pub fn generation_read_manifest_file(source_root: String, relative_path: String) -> Result<Vec<u8>, String> {
    read_manifest_bytes(&source_root, &relative_path)
}

pub fn read_manifest_bytes(source_root: &str, relative_path: &str) -> Result<Vec<u8>, String> {
    let root = canonical_source(source_root)?;
    let file = relative_file(&root, relative_path)?;
    let source = fs::File::open(&file).map_err(|_| "Foto sumber tidak dapat dibaca.".to_string())?;
    if source.metadata().map_err(|_| "Ukuran foto sumber tidak dapat diperiksa.".to_string())?.len() > MAX_SOURCE_IMAGE {
        return Err("Foto sumber melebihi batas 10 MiB.".into());
    }
    let mut bytes = Vec::new();
    source.take(MAX_SOURCE_IMAGE + 1).read_to_end(&mut bytes).map_err(|_| "Foto sumber tidak dapat dibaca.".to_string())?;
    if bytes.is_empty() || bytes.len() as u64 > MAX_SOURCE_IMAGE { return Err("Foto sumber kosong atau melebihi batas 10 MiB.".into()); }
    if !valid_image_header(&file, &bytes[..bytes.len().min(16)]) {
        return Err("Isi foto sumber tidak sesuai dengan format JPG, PNG, atau WebP.".into());
    }
    Ok(bytes)
}

#[tauri::command]
pub fn generation_validate_source(source_root: String, photos: Vec<String>, output_root: Option<String>) -> Result<serde_json::Value, String> {
    if photos.len() > 60_000 {
        return Err("Manifest berisi terlalu banyak file foto untuk diverifikasi.".into());
    }
    let root = canonical_source(&source_root)?;
    let mut valid = 0usize;
    let mut invalid_indexes = Vec::new();
    for (index, relative) in photos.iter().enumerate() {
        let checked = relative_file(&root, relative).and_then(|path| {
            let mut file = fs::File::open(&path).map_err(|_| "Foto sumber tidak dapat dibaca.".to_string())?;
            let mut header = [0u8; 16];
            let count = file.read(&mut header).map_err(|_| "Header foto sumber tidak dapat dibaca.".to_string())?;
            if valid_image_header(&path, &header[..count]) { Ok(()) }
            else { Err("Isi foto tidak sesuai format JPG, PNG, atau WebP.".into()) }
        });
        if checked.is_ok() { valid += 1; } else { invalid_indexes.push(index); }
    }
    let output_ready = if let Some(path) = output_root.filter(|value| !value.trim().is_empty()) {
        fs::canonicalize(path).map(|output| output.is_dir()).unwrap_or(false)
    } else { true };
    Ok(serde_json::json!({"checked": photos.len(), "valid": valid, "invalidIndexes": invalid_indexes, "outputReady": output_ready}))
}

#[tauri::command]
pub fn generation_save_original(source_root: String, store_name: String, generation_id: String, image_id: String, bytes: Vec<u8>) -> Result<String, String> {
    if bytes.is_empty() || bytes.len() > 50 * 1024 * 1024 { return Err("File asli kosong atau melebihi batas 50 MiB.".into()); }
    if image_format(&bytes[..bytes.len().min(16)]).is_none() { return Err("Respons unduhan bukan file gambar yang valid.".into()); }
    if !generation_id.bytes().all(|c| c.is_ascii_digit()) || !image_id.bytes().all(|c| c.is_ascii_digit()) { return Err("ID generation atau gambar tidak valid.".into()); }
    let root = canonical_source(&source_root)?;
    let store = safe_component(&store_name)?;
    let dir = root.join(".moto-studio").join("originals").join(store);
    fs::create_dir_all(&dir).map_err(|_| "Folder backup asli tidak dapat dibuat.".to_string())?;
    let dir = fs::canonicalize(&dir).map_err(|_| "Folder backup asli tidak dapat diperiksa.".to_string())?;
    if !dir.starts_with(&root) { return Err("Folder backup berada di luar folder sumber.".into()); }
    let path = dir.join(format!("{generation_id}-{image_id}.original"));
    if path.exists() { return Ok(path.to_string_lossy().into_owned()); }
    let mut staged = tempfile::NamedTempFile::new_in(&dir).map_err(|_| "File backup sementara tidak dapat dibuat.".to_string())?;
    staged.write_all(&bytes).map_err(|_| "File backup asli gagal ditulis.".to_string())?;
    staged.as_file().sync_all().map_err(|_| "File backup asli gagal disinkronkan.".to_string())?;
    staged.persist_noclobber(&path).map_err(|_| "File backup asli gagal disimpan secara atomik.".to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn generation_save_result(source_root: String, output_root: Option<String>, store_name: String, product_folder: String, filename: String, bytes: Vec<u8>) -> Result<String, String> {
    if bytes.is_empty() || bytes.len() >= MAX_OUTPUT_IMAGE { return Err("Ukuran file hasil harus di bawah 2.000.000 byte.".into()); }
    let expected_format = match Path::new(&filename).extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        _ => return Err("Format file hasil tidak didukung.".into()),
    };
    if image_format(&bytes[..bytes.len().min(16)]) != Some(expected_format) { return Err("Isi gambar hasil tidak cocok dengan ekstensi file.".into()); }
    let source = canonical_source(&source_root)?;
    let output = match output_root.filter(|path| !path.trim().is_empty()) {
        Some(path) => fs::canonicalize(path).map_err(|_| "Folder output pilihan tidak dapat diakses.".to_string())?,
        None => {
            let dir = source.join("Hasil Generate");
            fs::create_dir_all(&dir).map_err(|_| "Folder hasil generate tidak dapat dibuat.".to_string())?;
            fs::canonicalize(dir).map_err(|_| "Folder hasil generate tidak dapat diperiksa.".to_string())?
        }
    };
    if !output.is_dir() { return Err("Lokasi output bukan folder.".into()); }
    let store = safe_component(&store_name)?;
    let parts = hierarchy(&product_folder)?;
    let file = safe_component(&filename)?;
    let destination = parts.iter().fold(output.join(store), |path, part| path.join(part));
    fs::create_dir_all(&destination).map_err(|_| "Folder produk pada output tidak dapat dibuat.".to_string())?;
    let destination = fs::canonicalize(destination).map_err(|_| "Folder produk pada output tidak dapat diperiksa.".to_string())?;
    if !destination.starts_with(&output) { return Err("Jalur output keluar dari folder yang dipilih.".into()); }
    let name = Path::new(file);
    let stem = name.file_stem().and_then(|v| v.to_str()).ok_or("Nama file hasil tidak valid.")?;
    let ext = name.extension().and_then(|v| v.to_str()).ok_or("Format file hasil tidak valid.")?;
    if !["jpg", "jpeg", "png", "webp"].contains(&ext.to_ascii_lowercase().as_str()) { return Err("Format file hasil tidak didukung.".into()); }
    for index in 0..10_000usize {
        let candidate = if index == 0 { destination.join(file) } else { destination.join(format!("{stem} ({index}).{ext}")) };
        let mut staged = tempfile::NamedTempFile::new_in(&destination).map_err(|_| "File hasil sementara tidak dapat dibuat.".to_string())?;
        staged.write_all(&bytes).map_err(|_| "File hasil gagal ditulis.".to_string())?;
        staged.as_file().sync_all().map_err(|_| "File hasil gagal disinkronkan.".to_string())?;
        match staged.persist_noclobber(&candidate) {
            Ok(_) => return Ok(candidate.to_string_lossy().into_owned()),
            Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err("File hasil gagal disimpan secara atomik.".into()),
        }
    }
    Err("Terlalu banyak file dengan nama yang sama pada folder output.".into())
}

#[cfg(test)]
mod tests {
    use super::{generation_validate_source, image_format, read_manifest_bytes, valid_image_header};
    use std::path::Path;

    #[test]
    fn recognizes_supported_image_signatures_and_rejects_mismatches() {
        assert_eq!(image_format(&[0xff, 0xd8, 0xff, 0]), Some("image/jpeg"));
        assert!(valid_image_header(Path::new("photo.jpg"), &[0xff, 0xd8, 0xff, 0]));
        assert!(valid_image_header(Path::new("photo.PNG"), &[137, 80, 78, 71, 13, 10, 26, 10]));
        assert!(valid_image_header(Path::new("photo.webp"), b"RIFFxxxxWEBP"));
        assert!(!valid_image_header(Path::new("photo.jpg"), b"<html>"));
        assert!(!valid_image_header(Path::new("photo.png"), &[0xff, 0xd8, 0xff]));
        assert!(!valid_image_header(Path::new("photo.gif"), b"GIF89a"));
    }

    #[test]
    fn preflight_checks_source_files_and_output_folder_without_reading_image_bodies() {
        let source = tempfile::tempdir().unwrap();
        let output = tempfile::tempdir().unwrap();
        std::fs::write(source.path().join("valid.jpg"), [0xff, 0xd8, 0xff, 0, 1, 2]).unwrap();
        std::fs::write(source.path().join("invalid.jpg"), b"<html>not an image</html>").unwrap();

        let result = generation_validate_source(
            source.path().to_string_lossy().into_owned(),
            vec!["valid.jpg".into(), "invalid.jpg".into()],
            Some(output.path().to_string_lossy().into_owned()),
        ).unwrap();
        assert_eq!(result["checked"], 2);
        assert_eq!(result["valid"], 1);
        assert_eq!(result["invalidIndexes"][0], 1);
        assert_eq!(result["outputReady"], true);
        assert!(read_manifest_bytes(&source.path().to_string_lossy(), "valid.jpg").is_ok());
        assert!(read_manifest_bytes(&source.path().to_string_lossy(), "../outside.jpg").is_err());
    }
}
