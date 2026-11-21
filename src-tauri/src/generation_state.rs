use serde_json::{json, Value};
use std::io::Write;
use tauri::{AppHandle, Manager};

const FILE_NAME: &str = "generation-state.json";
const MAX_STATE_BYTES: usize = 25 * 1024 * 1024;

#[tauri::command]
pub async fn generation_state_load(app: AppHandle) -> Result<Value, String> {
    let dir = app.path().app_data_dir().map_err(|_| "Lokasi data aplikasi tidak tersedia.".to_string())?;
    match std::fs::read(dir.join(FILE_NAME)) {
        Ok(bytes) => {
            if bytes.len() > MAX_STATE_BYTES { return Err("Data pemulihan antrean melewati batas aman dan tidak diubah.".into()); }
            serde_json::from_slice(&bytes).map_err(|_| "Data pemulihan antrean rusak; file asli dipertahankan agar dapat diperiksa.".into())
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(json!({})),
        Err(_) => Err("Data pemulihan antrean tidak dapat dibaca.".into()),
    }
}

#[tauri::command]
pub async fn generation_state_save(app: AppHandle, state: Value) -> Result<(), String> {
    let bytes = serde_json::to_vec(&state).map_err(|_| "Data antrean tidak dapat disiapkan.".to_string())?;
    if bytes.len() > MAX_STATE_BYTES { return Err("Data antrean melewati batas penyimpanan aman.".into()); }
    let dir = app.path().app_data_dir().map_err(|_| "Lokasi data aplikasi tidak tersedia.".to_string())?;
    std::fs::create_dir_all(&dir).map_err(|_| "Folder data pemulihan antrean tidak dapat dibuat.".to_string())?;
    let mut staged = tempfile::NamedTempFile::new_in(&dir).map_err(|_| "File pemulihan sementara tidak dapat dibuat.".to_string())?;
    staged.write_all(&bytes).map_err(|_| "Data pemulihan antrean gagal ditulis.".to_string())?;
    staged.as_file().sync_all().map_err(|_| "Data pemulihan antrean gagal disinkronkan ke penyimpanan.".to_string())?;
    staged.persist(dir.join(FILE_NAME)).map_err(|_| "Data antrean baru gagal menggantikan salinan pemulihan sebelumnya.".to_string())?;
    Ok(())
}
