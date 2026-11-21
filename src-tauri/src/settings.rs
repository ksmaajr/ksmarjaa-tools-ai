use serde::{Deserialize, Serialize};
use std::{io::Write, path::Path, sync::{Mutex,LazyLock}, time::{Duration, Instant}};
use tauri::Manager;
use url::Url;

static SETTINGS_LOCK: Mutex<()> = Mutex::new(());
#[cfg(not(test))]
const SERVICE: &str = "com.ksmarjaatools.desktop.website-api";
#[cfg(test)]
const SERVICE: &str = "com.ksmarjaatools.desktop.TEST_ONLY";
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
struct ApiContract{base_url:String,stores_path:String}
static API:LazyLock<ApiContract>=LazyLock::new(||serde_json::from_str(include_str!("../../src/api-contract.json")).expect("Bundled API contract must be valid"));

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct Settings {
    pub schema_version: u32,
    pub base_url: String,
    pub api_test_path: String,
    pub batch_size: u32,
    pub batch_delay_seconds: u32,
    pub request_timeout_seconds: u32,
    pub polling_interval_seconds: u32,
    pub request_max_attempts: u32,
    pub download_max_attempts: u32,
    pub retry_initial_seconds: u32,
    pub retry_max_seconds: u32,
    pub retry_backoff: bool,
    pub auto_download: bool,
    pub use_custom_title: bool,
    pub motion: String,
    pub glass_opacity: u32,
    pub theme: String,
    pub language: String,
}
impl Default for Settings {
    fn default() -> Self { Self { schema_version:1, base_url:API.base_url.clone(), api_test_path:API.stores_path.clone(), batch_size:10, batch_delay_seconds:20, request_timeout_seconds:120, polling_interval_seconds:5, request_max_attempts:5, download_max_attempts:5, retry_initial_seconds:5, retry_max_seconds:60, retry_backoff:true, auto_download:true, use_custom_title:true, motion:"system".into(), glass_opacity:55, theme:"dark".into(), language:"id".into() } }
}
fn base_url(raw: &str) -> Result<Url,String> {
    let url = Url::parse(raw.trim()).map_err(|_| "URL website tidak valid.".to_string())?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if !(url.scheme() == "https" || (url.scheme() == "http" && local)) || url.host_str().is_none() || !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() { return Err("Gunakan HTTPS tanpa username, password, query, atau fragmen. HTTP hanya untuk localhost.".into()); }
    Ok(url)
}
fn test_url(base: &Url, path: &str) -> Result<Url,String> {
    if !path.starts_with('/') || path.starts_with("//") || path.contains(['?', '#', '\\']) { return Err("Endpoint tes harus berupa path, misalnya /api/tools/auth-check.".into()); }
    let url = base.join(path).map_err(|_| "Endpoint tes tidak valid.".to_string())?;
    if url.origin() != base.origin() { return Err("Endpoint tes harus berada pada website yang sama.".into()); }
    Ok(url)
}
fn validate(mut s: Settings) -> Result<Settings,String> {
    if s.schema_version != 1 { return Err("Versi pengaturan belum didukung.".into()); }
    // Migrate legacy editable URLs to the single trusted application contract.
    s.base_url = API.base_url.clone(); s.api_test_path = API.stores_path.clone(); s.batch_size=s.batch_size.clamp(1,30);
    let base = if s.base_url.is_empty() { Url::parse("https://example.invalid").unwrap() } else { base_url(&s.base_url)? };
    test_url(&base,&s.api_test_path)?;
    for (value,min,max,label) in [(s.batch_size,1,30,"Request per batch"),(s.batch_delay_seconds,0,86400,"Jeda batch"),(s.request_timeout_seconds,5,3600,"Timeout request"),(s.polling_interval_seconds,1,300,"Interval status"),(s.request_max_attempts,1,20,"Percobaan request"),(s.download_max_attempts,1,20,"Percobaan download"),(s.retry_initial_seconds,1,3600,"Jeda awal retry"),(s.retry_max_seconds,1,86400,"Jeda maksimum retry"),(s.glass_opacity,35,95,"Opasitas kaca")] {
        if value<min || value>max { return Err(format!("{label} harus antara {min} dan {max}.")); }
    }
    if s.retry_max_seconds < s.retry_initial_seconds { return Err("Jeda maksimum retry harus sama atau lebih besar dari jeda awal.".into()); }
    if !["system","full","reduced"].contains(&s.motion.as_str()) { return Err("Pilihan animasi tidak valid.".into()); }
    if !["dark","light"].contains(&s.theme.as_str()) { return Err("Pilihan tema tidak valid.".into()); }
    if !["id","en"].contains(&s.language.as_str()) { return Err("Pilihan bahasa tidak valid.".into()); }
    Ok(s)
}
fn entry(base: &str) -> Result<keyring::Entry,String> {
    let target = base_url(base)?.as_str().trim_end_matches('/').to_string();
    keyring::Entry::new(SERVICE,&target).map_err(|_| "Windows Credential Manager tidak dapat dibuka.".into())
}
pub(crate) fn read_key(base: &str) -> Result<Option<String>,String> {
    if base.is_empty() { return Ok(None); }
    match entry(base)?.get_password() { Ok(key)=>Ok(Some(key)), Err(keyring::Error::NoEntry)=>Ok(None), Err(_)=>Err("API key tidak dapat dibaca dari Windows Credential Manager.".into()) }
}
fn delete_key(base: &str) -> Result<(),String> {
    match entry(base)?.delete_credential() { Ok(())|Err(keyring::Error::NoEntry)=>Ok(()), Err(_)=>Err("API key tidak dapat dihapus dari Windows Credential Manager.".into()) }
}
fn read_settings(dir: &Path) -> Result<Settings,String> {
    match std::fs::read(dir.join("settings.json")) {
        Ok(bytes)=>validate(serde_json::from_slice(&bytes).map_err(|_| "File pengaturan rusak. Data lama tidak ditimpa.".to_string())?),
        Err(e) if e.kind()==std::io::ErrorKind::NotFound=>Ok(Settings::default()),
        Err(_)=>Err("File pengaturan tidak dapat dibaca.".into())
    }
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Snapshot { settings:Settings, has_api_key:bool }
#[tauri::command]
pub async fn settings_load(app: tauri::AppHandle) -> Result<Snapshot,String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard=SETTINGS_LOCK.lock().map_err(|_| "Pengaturan sedang tidak tersedia.".to_string())?;
        let dir=app.path().app_config_dir().map_err(|_| "Lokasi pengaturan tidak tersedia.".to_string())?;
        let settings=read_settings(&dir)?;
        let has_api_key=read_key(&settings.base_url)?.is_some();
        Ok(Snapshot {settings,has_api_key})
    }).await.map_err(|_| "Pengaturan gagal dimuat.".to_string())?
}
#[tauri::command]
pub async fn settings_save(app:tauri::AppHandle, settings:Settings, key_action:String, api_key:Option<String>) -> Result<Snapshot,String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard=SETTINGS_LOCK.lock().map_err(|_| "Pengaturan sedang tidak tersedia.".to_string())?;
        let dir=app.path().app_config_dir().map_err(|_| "Lokasi pengaturan tidak tersedia.".to_string())?;
        commit_settings(&dir,settings,key_action,api_key)
    }).await.map_err(|_| "Pengaturan gagal disimpan.".to_string())?
}
fn commit_settings(dir:&Path,settings:Settings,key_action:String,api_key:Option<String>)->Result<Snapshot,String>{
        let settings=validate(settings)?;
        if !["keep","set","remove"].contains(&key_action.as_str()) { return Err("Aksi API key tidak valid.".into()); }
        let new_key=api_key.unwrap_or_default();
        if key_action=="set" { validate_key(&new_key)?; }
        let old_key=read_key(&settings.base_url)?;
        if key_action!="keep" && settings.base_url.is_empty() {return Err("Isi URL website sebelum menyimpan API key.".into());}
        std::fs::create_dir_all(dir).map_err(|_| "Folder pengaturan tidak dapat dibuat.".to_string())?;
        let mut file=tempfile::NamedTempFile::new_in(dir).map_err(|_| "File pengaturan sementara tidak dapat dibuat.".to_string())?;
        let bytes=serde_json::to_vec_pretty(&settings).map_err(|_| "Pengaturan tidak dapat disusun.".to_string())?;
        file.write_all(&bytes).and_then(|_|file.as_file().sync_all()).map_err(|_| "Pengaturan tidak dapat ditulis.".to_string())?;
        if key_action=="set" {entry(&settings.base_url)?.set_password(&new_key).map_err(|_| "API key gagal disimpan di Windows Credential Manager.".to_string())?;}
        if key_action=="remove" {delete_key(&settings.base_url)?;if read_key(&settings.base_url)?.is_some(){return Err("API key masih terdeteksi setelah penghapusan. Silakan coba lagi.".into());}}
        if file.persist(dir.join("settings.json")).is_err() {
            if key_action!="keep" {
                let rollback=match old_key {Some(ref old)=>entry(&settings.base_url)?.set_password(old).map_err(|_|()),None=>delete_key(&settings.base_url).map_err(|_|())};
                if rollback.is_err(){return Err("Pengaturan gagal disimpan dan status API key berubah. Periksa lalu simpan API key kembali.".into());}
            }
            return Err("Pengaturan gagal disimpan. Pengaturan sebelumnya dipertahankan.".into());
        }
        Ok(Snapshot {has_api_key: if key_action=="set" {true} else if key_action=="remove" {false} else {old_key.is_some()},settings})
}
fn validate_key(key:&str)->Result<(),String>{
    if key.trim().is_empty() || key.len()>2048 || key.chars().any(|c|c.is_control()||c.is_whitespace()) {Err("API key harus diisi, tanpa spasi, maksimal 2048 karakter.".into())} else {Ok(())}
}
#[derive(Serialize,Deserialize,Debug)]
pub struct StoreSummary{pub id:u64,pub name:String,#[serde(default)]pub templates_count:u32}
#[derive(Serialize,Debug)]
#[serde(rename_all="camelCase")]
pub struct ApiTest { pub code:String,pub message:String,pub http_status:Option<u16>,pub latency_ms:u128,pub stores:Vec<StoreSummary> }
fn outcome(code:&str,message:&str,status:Option<u16>,start:Instant)->ApiTest{ApiTest{code:code.into(),message:message.into(),http_status:status,latency_ms:start.elapsed().as_millis(),stores:Vec::new()}}
#[tauri::command]
pub async fn settings_test_api(api_key:Option<String>,timeout_seconds:u32)->Result<ApiTest,String>{
    let base=base_url(&API.base_url)?;let endpoint=test_url(&base,&API.stores_path)?;
    let key=if let Some(key)=api_key {key} else {tauri::async_runtime::spawn_blocking(||read_key(&API.base_url)).await.map_err(|_|"API key tidak dapat diakses.".to_string())??.ok_or("API key Rizky Moto AI belum diisi atau disimpan.")?};
    validate_key(&key)?;
    if !(5..=3600).contains(&timeout_seconds){return Err("Timeout harus antara 5 dan 3600 detik.".into());}
    probe(endpoint,&key,timeout_seconds).await
}
async fn probe(endpoint:Url,key:&str,timeout:u32)->Result<ApiTest,String>{
    let start=Instant::now();
    let client=reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(timeout.into())).connect_timeout(Duration::from_secs(timeout.min(15).into())).build().map_err(|_|"Klien koneksi tidak dapat dibuat.".to_string())?;
    let response=match client.get(endpoint.clone()).header("Accept","application/json").bearer_auth(key).send().await {
        Ok(r)=>r,Err(e)=>return Ok(if e.is_timeout(){outcome("timeout","Website tidak merespons sebelum batas waktu.",None,start)}else{outcome("network_error","Tidak dapat terhubung. Periksa URL, internet, DNS, dan sertifikat HTTPS.",None,start)})
    };
    let status=response.status().as_u16();
    let (code,message)=match status {
        401 => ("unauthorized","API key salah, sudah kedaluwarsa, atau telah dicabut oleh website."),
        403 => ("forbidden","API key tidak memiliki izin images:generate untuk membaca katalog toko."),
        404 => ("not_found","Katalog toko API tidak ditemukan. Periksa deployment fitur API website."),
        405 => ("method_not_allowed","Endpoint belum mendukung GET. Pilih endpoint tes autentikasi GET."),
        429 => ("rate_limited","Batas request website tercapai. Coba lagi setelah beberapa saat."),
        300..=399 => ("redirect","Website mengalihkan request, misalnya ke halaman login. API key belum terverifikasi."),
        500..=599 => ("server_error","Website mengalami gangguan server. API key belum dapat diverifikasi."),
        200 => ("",""),_ => ("unexpected","Respons website tidak sesuai endpoint tes API.")
    };
    if !code.is_empty(){return Ok(outcome(code,message,Some(status),start));}
    let json_type=response.headers().get("content-type").and_then(|h|h.to_str().ok()).map(|v|v.split(';').next().unwrap_or("").trim().ends_with("json")).unwrap_or(false);
    if !json_type{return Ok(outcome("invalid_response","Website merespons, tetapi bukan JSON autentikasi. API key belum terverifikasi.",Some(status),start));}
    if response.content_length().is_some_and(|n|n>65536){return Ok(outcome("invalid_response","Respons endpoint terlalu besar untuk tes autentikasi.",Some(status),start));}
    let mut response=response;let mut body=Vec::new();
    while let Some(chunk)=response.chunk().await.map_err(|_|"Respons tes terputus. Coba kembali.".to_string())?{if body.len()+chunk.len()>65536{return Ok(outcome("invalid_response","Respons endpoint terlalu besar untuk tes autentikasi.",Some(status),start));}body.extend_from_slice(&chunk);}
    let json:serde_json::Value=serde_json::from_slice(&body).unwrap_or(serde_json::Value::Null);
    let stores:Vec<StoreSummary>=match json.get("data").and_then(|data|serde_json::from_value::<Vec<StoreSummary>>(data.clone()).ok()){
        Some(stores) if stores.iter().all(|store:&StoreSummary|store.id>0&&!store.name.trim().is_empty())=>stores,
        _=>return Ok(outcome("invalid_response","Respons bukan katalog toko Rizky Moto AI yang sesuai. API key belum terverifikasi.",Some(status),start))
    };
    let message=if stores.is_empty(){"API key valid. Belum ada toko aktif yang dapat diakses.".to_string()}else{format!("API key valid. {} toko aktif dapat diakses.",stores.len())};
    let mut result=outcome("valid",&message,Some(status),start);result.stores=stores;Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{io::{Read,Write},net::TcpListener,thread};
    fn mock_server(responses:Vec<(u16,&'static str,&'static str)>)->(Url,thread::JoinHandle<Vec<bool>>){
        let listener=TcpListener::bind("127.0.0.1:0").unwrap();let address=listener.local_addr().unwrap();listener.set_nonblocking(true).unwrap();
        let handle=thread::spawn(move||{
            let deadline=Instant::now()+Duration::from_secs(8);let mut auth_seen=Vec::new();
            for(status,content_type,body)in responses{
                let(mut stream,_)=loop{match listener.accept(){Ok(pair)=>break pair,Err(e)if e.kind()==std::io::ErrorKind::WouldBlock=>{assert!(Instant::now()<deadline,"Test server did not receive expected request");thread::sleep(Duration::from_millis(5));},Err(_)=>panic!("Test server failed")}};
                stream.set_nonblocking(false).unwrap();stream.set_read_timeout(Some(Duration::from_secs(2))).unwrap();let mut bytes=Vec::new();let mut buffer=[0u8;1024];
                while !bytes.windows(4).any(|b|b==b"\r\n\r\n"){let n=stream.read(&mut buffer).unwrap();if n==0{break;}bytes.extend_from_slice(&buffer[..n]);assert!(bytes.len()<16384);}
                let request=String::from_utf8_lossy(&bytes).to_lowercase();auth_seen.push(request.contains("authorization: bearer dummy-test-only"));
                let response=format!("HTTP/1.1 {status} Test\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len());stream.write_all(response.as_bytes()).unwrap();
            }auth_seen
        });(Url::parse(&format!("http://{address}/api/tools/auth-check")).unwrap(),handle)
    }
    #[test]fn validates_defaults_and_rejects_untrusted_urls(){
        assert!(validate(Settings::default()).is_ok());
        for raw in ["http://remote.example","https://user:secret@example.com","https://example.com?key=x","file:///C:/test"]{assert!(base_url(raw).is_err());}
        assert!(base_url("http://localhost:8080").is_ok());
        let base=base_url("https://example.com").unwrap();for path in ["//evil.example/path","https://evil.example/path","/check?key=x"]{assert!(test_url(&base,path).is_err());}
        let mut bad=Settings::default();bad.retry_initial_seconds=90;assert!(validate(bad).is_err());
    }
    #[test]fn rejects_malformed_settings_without_overwriting(){
        let dir=tempfile::tempdir().unwrap();assert_eq!(read_settings(dir.path()).unwrap().batch_size,10);
        std::fs::write(dir.path().join("settings.json"),b"invalid-json").unwrap();assert!(read_settings(dir.path()).is_err());assert_eq!(std::fs::read(dir.path().join("settings.json")).unwrap(),b"invalid-json");
    }
    #[test]fn saves_and_reloads_settings_atomically(){
        let _guard=SETTINGS_LOCK.lock().unwrap();
        let dir=tempfile::tempdir().unwrap();let mut settings=Settings::default();settings.batch_size=24;
        let first=commit_settings(dir.path(),settings,"keep".into(),None).unwrap();assert!(!first.has_api_key);assert_eq!(read_settings(dir.path()).unwrap().batch_size,24);
        let mut changed=first.settings;changed.batch_size=30;commit_settings(dir.path(),changed,"keep".into(),None).unwrap();assert_eq!(read_settings(dir.path()).unwrap().batch_size,30);
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(),1);
        let mut invalid=Settings::default();invalid.glass_opacity=0;assert!(commit_settings(dir.path(),invalid,"keep".into(),None).is_err());assert_eq!(read_settings(dir.path()).unwrap().batch_size,30);
    }
    #[cfg(windows)]
    #[test]fn credential_changes_and_file_commit_rollback_are_consistent(){
        let _guard=SETTINGS_LOCK.lock().unwrap();
        let dir=tempfile::tempdir().unwrap();let settings=Settings::default();
        struct Cleanup(String);impl Drop for Cleanup{fn drop(&mut self){let _=delete_key(&self.0);}}
        let _cleanup=Cleanup(settings.base_url.clone());
        let saved=commit_settings(dir.path(),settings.clone(),"set".into(),Some("dummy-test-only".into())).unwrap();assert!(saved.has_api_key);
        let disk=std::fs::read_to_string(dir.path().join("settings.json")).unwrap();assert!(!disk.contains("dummy-test-only"));assert_eq!(read_key(&settings.base_url).unwrap().as_deref(),Some("dummy-test-only"));
        let other=tempfile::tempdir().unwrap();std::fs::create_dir(other.path().join("settings.json")).unwrap();
        assert!(commit_settings(other.path(),settings.clone(),"set".into(),Some("replacement-test-only".into())).is_err());assert_eq!(read_key(&settings.base_url).unwrap().as_deref(),Some("dummy-test-only"));
        let removed=commit_settings(dir.path(),settings.clone(),"remove".into(),None).unwrap();assert!(!removed.has_api_key);assert!(read_key(&settings.base_url).unwrap().is_none());
    }
    #[test]fn valid_api_reads_real_store_catalog_contract(){
        let(url,server)=mock_server(vec![(200,"application/json","{\"data\":[{\"id\":1,\"name\":\"Rizky Moto\",\"templates_count\":1}]}")]);
        let result=tauri::async_runtime::block_on(probe(url,"dummy-test-only",5)).unwrap();assert_eq!(result.code,"valid");assert_eq!(result.stores[0].id,1);assert_eq!(server.join().unwrap(),vec![true]);
        let(url,server)=mock_server(vec![(200,"application/json","{\"data\":[]}")]);let result=tauri::async_runtime::block_on(probe(url,"dummy-test-only",5)).unwrap();assert_eq!(result.code,"valid");assert!(result.stores.is_empty());server.join().unwrap();
    }
    #[test]fn distinguishes_api_failures_and_rejects_public_health_endpoints(){
        for(status,content,body,expected)in [(401,"application/json","{}","unauthorized"),(403,"application/json","{}","forbidden"),(404,"application/json","{}","not_found"),(429,"application/json","{}","rate_limited"),(503,"application/json","{}","server_error"),(302,"text/html","login","redirect"),(200,"text/html","<html>Login</html>","invalid_response"),(200,"application/json","{}","invalid_response"),(200,"application/json","{\"authenticated\":true}","invalid_response"),(200,"application/json","{\"data\":[{\"id\":0,\"name\":\"Wrong\"}]}","invalid_response")]{
            let(url,server)=mock_server(vec![(status,content,body)]);let result=tauri::async_runtime::block_on(probe(url,"dummy-test-only",5)).unwrap();assert_eq!(result.code,expected);server.join().unwrap();
        }
    }
    #[test]fn legacy_config_cannot_override_trusted_api_host_or_routes(){
        let mut legacy=Settings::default();legacy.base_url="https://other.example".into();legacy.api_test_path="/api/tools/auth-check".into();legacy.batch_size=25;let migrated=validate(legacy).unwrap();assert_eq!(migrated.base_url,API.base_url);assert_eq!(migrated.api_test_path,"/api/v1/catalog/stores");assert_eq!(migrated.batch_size,25);
    }
    #[cfg(windows)]
    #[test]fn windows_credential_manager_round_trip_uses_isolated_test_entry(){
        let target=format!("credential-test-{}-{}",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos());
        let e=keyring::Entry::new("com.ksmarjaatools.desktop.TEST_ONLY",&target).unwrap();
        struct Cleanup(keyring::Entry);impl Drop for Cleanup{fn drop(&mut self){let _=self.0.delete_credential();}}
        let cleanup=Cleanup(e);cleanup.0.set_password("dummy-test-only").unwrap();assert_eq!(cleanup.0.get_password().unwrap(),"dummy-test-only");cleanup.0.delete_credential().unwrap();assert!(matches!(cleanup.0.get_password(),Err(keyring::Error::NoEntry)));
    }
}
