mod settings;
mod generation;
mod generation_state;
mod generation_files;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![settings::settings_load, settings::settings_save, settings::settings_test_api, generation::generation_catalog, generation::generation_templates, generation::generation_submit, generation::generation_status, generation::generation_cancel, generation::generation_download, generation_state::generation_state_load, generation_state::generation_state_save, generation_files::generation_read_manifest_file, generation_files::generation_validate_source, generation_files::generation_save_original, generation_files::generation_save_result, generation_files::generation_delete_manifest])
        .run(tauri::generate_context!())
        .expect("KSMARJAA TOOLS AI could not start");
}
