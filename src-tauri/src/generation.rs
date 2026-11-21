use serde::{Deserialize, Serialize};
use std::time::{Duration,Instant};
use crate::settings;

#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
struct Contract { base_url:String, stores_path:String, templates_path:String, models_path:String, generations_path:String, generation_status_path:String, generation_image_path:String, generation_cancel_path:String }
static API: std::sync::LazyLock<Contract> = std::sync::LazyLock::new(|| serde_json::from_str(include_str!("../../src/api-contract.json")).expect("API contract"));
static REQUEST_GATE:tokio::sync::Mutex<Vec<Instant>>=tokio::sync::Mutex::const_new(Vec::new());

#[derive(Serialize)] #[serde(rename_all="camelCase")]
pub struct ApiReply { status:u16, retry_after:Option<u64>, request_id:Option<String>, content_type:Option<String>, body:serde_json::Value }
#[derive(Serialize)] #[serde(rename_all="camelCase")]
pub struct DownloadReply { status:u16, retry_after:Option<u64>, request_id:Option<String>, mime:String, bytes:Vec<u8> }
fn key()->Result<String,String>{ settings::read_key(&API.base_url)?.ok_or_else(||"API key Rizky Moto AI belum disimpan di Pengaturan.".into()) }
fn client(timeout:u32)->Result<reqwest::Client,String>{ reqwest::Client::builder().timeout(Duration::from_secs(timeout.clamp(5,3600) as u64)).connect_timeout(Duration::from_secs(timeout.clamp(5,15) as u64)).redirect(reqwest::redirect::Policy::none()).build().map_err(|_|"Klien API tidak dapat dibuat.".into()) }
async fn pace_request(){loop{let delay={let mut times=REQUEST_GATE.lock().await;let now=Instant::now();times.retain(|at|now.duration_since(*at)<Duration::from_secs(60));if times.len()<55{times.push(now);return;}times.first().map(|at|Duration::from_secs(60).saturating_sub(now.duration_since(*at))).unwrap_or(Duration::from_secs(1))};tokio::time::sleep(delay.max(Duration::from_millis(100))).await;}}
async fn json_call(method:reqwest::Method,url:String,timeout:u32,form:Option<reqwest::multipart::Form>)->Result<ApiReply,String>{
 pace_request().await;let key=key()?;let request_id=uuid::Uuid::new_v4().to_string();let mut req=client(timeout)?.request(method,url).bearer_auth(key).header("Accept","application/json").header("X-Client-Name","KSMARJAA TOOLS AI").header("X-Request-ID",&request_id); if let Some(f)=form { req=req.multipart(f); }
 let res=req.send().await.map_err(|e|if e.is_timeout(){format!("Request API melewati batas timeout ({e}) · Request ID {request_id}. Untuk POST, periksa status sebelum mencoba ulang.")}else if e.is_connect(){format!("Request tidak dikirim: koneksi ke website gagal sebelum tersambung ({e}) · Request ID {request_id}.")}else{format!("Koneksi ke website gagal setelah request mulai dikirim ({e}) · Request ID {request_id}. Untuk POST, periksa status sebelum mencoba ulang.")})?;
 let status=res.status().as_u16(); let retry_after=res.headers().get("retry-after").and_then(|v|v.to_str().ok()).and_then(|v|v.parse().ok());let response_request_id=res.headers().get("x-request-id").or_else(||res.headers().get("request-id")).and_then(|v|v.to_str().ok()).map(str::to_owned);let content_type=res.headers().get("content-type").and_then(|v|v.to_str().ok()).map(str::to_owned);
 if res.content_length().is_some_and(|length|length>2*1024*1024){return Err("Respons API melebihi batas 2 MB.".into());}
 let mut response=res;let mut bytes=Vec::with_capacity(response.content_length().unwrap_or(0).min(2*1024*1024) as usize);
 while let Some(chunk)=response.chunk().await.map_err(|e|format!("Respons API terputus sebelum selesai dibaca ({e}) · Request ID {}.",response_request_id.as_deref().unwrap_or(&request_id)))?{if bytes.len().saturating_add(chunk.len())>2*1024*1024{return Err("Respons API melebihi batas 2 MB.".into());}bytes.extend_from_slice(&chunk);}
 let body=serde_json::from_slice(&bytes).unwrap_or_else(|_|serde_json::json!({"message":String::from_utf8_lossy(&bytes).to_string()}));let request_id=response_request_id.or_else(||body.get("request_id").and_then(|v|v.as_str()).map(str::to_owned)).or(Some(request_id));Ok(ApiReply{status,retry_after,request_id,content_type,body})
}
fn url(path:String)->String{format!("{}{}",API.base_url.trim_end_matches('/'),path)}
fn safe_id(id:&str)->Result<&str,String>{if !id.is_empty()&&id.len()<=20&&id.bytes().all(|b|b.is_ascii_digit()){Ok(id)}else{Err("ID generation atau gambar tidak valid.".into())}}
fn diagnostic(body:&serde_json::Value)->String{
 fn safe(value:&serde_json::Value,depth:u8)->serde_json::Value{if depth>5{return serde_json::Value::String("[detail nested dibatasi]".into());}match value{serde_json::Value::Object(map)=>serde_json::Value::Object(map.iter().filter(|(key,_)|{let k=key.to_ascii_lowercase();!k.contains("token")&&!k.contains("secret")&&!k.contains("password")&&!k.contains("credential")&&!k.contains("authorization")&&!k.contains("api_key")&&!k.contains("apikey")&&!k.contains("base64")}).map(|(key,val)|(key.clone(),safe(val,depth+1))).collect()),serde_json::Value::Array(items)=>serde_json::Value::Array(items.iter().take(30).map(|item|safe(item,depth+1)).collect()),serde_json::Value::String(text)=>serde_json::Value::String(text.chars().take(3500).collect()),_=>value.clone()}}
 serde_json::to_string(&safe(body,0)).unwrap_or_else(|_|"Detail respons tidak dapat dibaca.".into())
}
#[tauri::command] pub async fn generation_catalog(timeout_seconds:u32)->Result<serde_json::Value,String>{
 let stores=json_call(reqwest::Method::GET,url(API.stores_path.clone()),timeout_seconds,None).await?; if stores.status!=200{return Err(format!("Katalog toko gagal (HTTP {}): {} · request ID {}",stores.status,diagnostic(&stores.body),stores.request_id.as_deref().unwrap_or("tidak tersedia")));}
 let models=json_call(reqwest::Method::GET,url(API.models_path.clone()),timeout_seconds,None).await?; if models.status!=200{return Err(format!("Model website gagal dimuat (HTTP {}): {} · request ID {}",models.status,diagnostic(&models.body),models.request_id.as_deref().unwrap_or("tidak tersedia")));}
 Ok(serde_json::json!({"stores":stores.body,"models":models.body,"requestMeta":{"stores":{"status":stores.status,"requestId":stores.request_id},"models":{"status":models.status,"requestId":models.request_id}}}))
}
#[tauri::command] pub async fn generation_templates(store_id:u64,timeout_seconds:u32)->Result<ApiReply,String>{json_call(reqwest::Method::GET,url(API.templates_path.replace("{store}",&store_id.to_string())),timeout_seconds,None).await}
#[tauri::command] pub async fn generation_submit(source_root:String,product_path:String,installed_path:Option<String>,store_id:u64,template_id:u64,custom_title:Option<String>,product_name:String,product_mime:String,installed_name:Option<String>,installed_mime:Option<String>,timeout_seconds:u32)->Result<ApiReply,String>{
 let product_bytes=crate::generation_files::read_manifest_bytes(&source_root,&product_path)?;let installed_bytes=installed_path.as_deref().map(|path|crate::generation_files::read_manifest_bytes(&source_root,path)).transpose()?;
 let mut form=reqwest::multipart::Form::new().text("store_id",store_id.to_string()).text("template_id",template_id.to_string()).part("product_image",reqwest::multipart::Part::bytes(product_bytes).file_name(product_name).mime_str(&product_mime).map_err(|_|"Format foto produk tidak valid.")?);
 if let (Some(name),Some(mime),Some(bytes))=(installed_name,installed_mime,installed_bytes){form=form.part("installed_image",reqwest::multipart::Part::bytes(bytes).file_name(name).mime_str(&mime).map_err(|_|"Format foto terpasang tidak valid.")?);}
 if let Some(title)=custom_title {form=form.text("custom_title",title);}
 json_call(reqwest::Method::POST,url(API.generations_path.clone()),timeout_seconds,Some(form)).await
}
#[tauri::command] pub async fn generation_status(generation_id:String,timeout_seconds:u32)->Result<ApiReply,String>{let id=safe_id(&generation_id)?;json_call(reqwest::Method::GET,url(API.generation_status_path.replace("{generation}",id)),timeout_seconds,None).await}
#[tauri::command] pub async fn generation_cancel(generation_id:String,timeout_seconds:u32)->Result<ApiReply,String>{let id=safe_id(&generation_id)?;json_call(reqwest::Method::POST,url(API.generation_cancel_path.replace("{generation}",id)),timeout_seconds,None).await}
#[tauri::command] pub async fn generation_download(generation_id:String,image_id:String,timeout_seconds:u32)->Result<DownloadReply,String>{
 pace_request().await;let key=key()?;let client=client(timeout_seconds)?;let generation_id=safe_id(&generation_id)?;let image_id=safe_id(&image_id)?;let path=API.generation_image_path.replace("{generation}",generation_id).replace("{image}",image_id);let request_id=uuid::Uuid::new_v4().to_string();
 let res=client.get(url(path)).bearer_auth(key).header("X-Client-Name","KSMARJAA TOOLS AI").header("X-Request-ID",&request_id).send().await.map_err(|e|format!("Unduhan gambar gagal tersambung ({e}) · Request ID {request_id}."))?;let status=res.status().as_u16();let retry_after=res.headers().get("retry-after").and_then(|v|v.to_str().ok()).and_then(|v|v.parse().ok());let response_request_id=res.headers().get("x-request-id").or_else(||res.headers().get("request-id")).and_then(|v|v.to_str().ok()).map(str::to_owned);let header_mime=res.headers().get("content-type").and_then(|v|v.to_str().ok()).unwrap_or("application/octet-stream").split(';').next().unwrap_or("application/octet-stream").to_string();
 if res.content_length().is_some_and(|length|length>50*1024*1024){return Err("Gambar asli melebihi batas 50 MiB.".into());}
 let mut response=res;let mut bytes=Vec::with_capacity(response.content_length().unwrap_or(0).min(50*1024*1024) as usize);
 while let Some(chunk)=response.chunk().await.map_err(|e|format!("Unduhan gambar terputus ({e}) · Request ID {}.",response_request_id.as_deref().unwrap_or(&request_id)))?{if bytes.len().saturating_add(chunk.len())>50*1024*1024{return Err("Gambar asli melebihi batas 50 MiB.".into());}bytes.extend_from_slice(&chunk);}
 let mime=if status==200{crate::generation_files::image_format(&bytes).ok_or_else(||format!("Respons unduhan HTTP 200 bukan file gambar valid · Request ID {}.",response_request_id.as_deref().unwrap_or(&request_id)))?.to_string()}else{header_mime};
 let body_request_id=if status>=400{serde_json::from_slice::<serde_json::Value>(&bytes).ok().and_then(|body|body.get("request_id").and_then(|value|value.as_str()).map(str::to_owned))}else{None};let server_request_id=response_request_id.or(body_request_id).or(Some(request_id));Ok(DownloadReply{status,retry_after,request_id:server_request_id,mime,bytes})
}
