//! Desktop-Hülle des 3D-Web-Editors.
//!
//! Neben den Plugins für Dateidialoge und Dateizugriff enthält sie den Webserver für den
//! Vorschau-Link im lokalen WLAN: Er liefert die Webvorschau des Editors und die Dateien des
//! aktuellen Projekts aus, damit die Seite auf einem echten Smartphone geprüft werden kann.

use std::fs;
use std::io::Read;
use std::net::UdpSocket;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, State};
use tiny_http::{Header, Method, Request, Response, Server};

/// Laufender Vorschau-Server und die Messungen, die Geräte gemeldet haben.
#[derive(Default)]
struct LanPreview {
    server: Mutex<Option<Arc<Server>>>,
    reports: Arc<Mutex<Vec<String>>>,
}

/// Adresse dieses Rechners im lokalen Netz. Es wird dabei nichts gesendet; die Verbindung
/// dient nur dazu, die passende Netzwerkschnittstelle zu ermitteln.
fn local_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("192.168.0.1:9").ok()?;
    Some(socket.local_addr().ok()?.ip().to_string())
}

fn content_type(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("").to_ascii_lowercase().as_str() {
        "html" => "text/html; charset=utf-8",
        "js" => "text/javascript",
        "css" => "text/css",
        "json" => "application/json",
        "wasm" => "application/wasm",
        "glb" => "model/gltf-binary",
        "gltf" => "model/gltf+json",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("gültiger Header")
}

/// Pfad innerhalb des Projektordners. Verweise nach außen ("..") werden abgelehnt.
fn inside(dir: &Path, relative: &str) -> Option<PathBuf> {
    let relative = Path::new(relative);
    if relative.components().all(|part| matches!(part, Component::Normal(_))) {
        Some(dir.join(relative))
    } else {
        None
    }
}

fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() && text.is_char_boundary(i + 1) && text.is_char_boundary(i + 3) {
            if let Ok(value) = u8::from_str_radix(&text[i + 1..i + 3], 16) {
                out.push(value);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn respond(request: Request, status: u16, mime: &str, body: Vec<u8>) {
    let response = Response::from_data(body)
        .with_status_code(status)
        .with_header(header("Content-Type", mime))
        // Kalter Cache: Das Gerät lädt bei jedem Aufruf alles neu.
        .with_header(header("Cache-Control", "no-store"));
    let _ = request.respond(response);
}

fn handle(mut request: Request, app: &AppHandle, dir: &Path, token: &str, reports: &Arc<Mutex<Vec<String>>>) {
    let url = request.url().to_string();
    let path = percent_decode(url.split('?').next().unwrap_or("/").trim_start_matches('/'));
    let lan_prefix = format!("lan/{token}/");

    if let Some(rest) = path.strip_prefix(&lan_prefix) {
        // Messung eines Geräts entgegennehmen
        if rest == "report" && *request.method() == Method::Post {
            let mut body = String::new();
            let _ = request.as_reader().take(4096).read_to_string(&mut body);
            if let Ok(mut list) = reports.lock() {
                list.push(body);
            }
            return respond(request, 204, "text/plain", Vec::new());
        }
        // Datei des Projekts ausliefern
        return match inside(dir, rest).and_then(|file| fs::read(file).ok()) {
            Some(bytes) => respond(request, 200, content_type(rest), bytes),
            None => respond(request, 404, "text/plain", b"Nicht gefunden".to_vec()),
        };
    }

    // Alles andere ist die Webvorschau des Editors selbst (preview.html und ihre Skripte).
    let asset_path = if path.is_empty() { "preview.html".to_string() } else { path };
    match app.asset_resolver().get(asset_path.clone()) {
        Some(asset) => respond(request, 200, &asset.mime_type, asset.bytes),
        None => respond(request, 404, "text/plain", b"Nicht gefunden".to_vec()),
    }
}

/// Startet den Vorschau-Server und liefert die Adresse für das Smartphone.
/// `dir` ist der Ordner, in den der Editor die Dateien des Projekts gelegt hat.
#[tauri::command]
fn lan_preview_start(app: AppHandle, state: State<LanPreview>, dir: String) -> Result<String, String> {
    lan_preview_stop(state.clone());

    let ip = local_ip().ok_or("Dieser Rechner hat keine Adresse im lokalen Netz.")?;
    let server = Arc::new(Server::http("0.0.0.0:0").map_err(|error| format!("Der Vorschau-Server konnte nicht starten: {error}"))?);
    let port = server.server_addr().to_ip().map(|address| address.port()).ok_or("Kein Port verfügbar.")?;
    // Der Link ist temporär: Das Token gilt nur, solange dieser Server läuft.
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let token = format!("{:x}", nanos ^ (u128::from(port) << 64));

    if let Ok(mut list) = state.reports.lock() {
        list.clear();
    }
    let reports = state.reports.clone();
    let worker = server.clone();
    let folder = PathBuf::from(dir);
    let worker_token = token.clone();
    thread::spawn(move || {
        for request in worker.incoming_requests() {
            handle(request, &app, &folder, &worker_token, &reports);
        }
    });

    *state.server.lock().map_err(|_| "Interner Fehler")? = Some(server);
    Ok(format!("http://{ip}:{port}/preview.html?lan={token}"))
}

/// Messungen, die Geräte über den Vorschau-Link gemeldet haben (JSON-Texte).
#[tauri::command]
fn lan_preview_reports(state: State<LanPreview>) -> Vec<String> {
    state.reports.lock().map(|list| list.clone()).unwrap_or_default()
}

/// Beendet den Vorschau-Server; der Link ist danach ungültig.
#[tauri::command]
fn lan_preview_stop(state: State<LanPreview>) {
    if let Ok(mut server) = state.server.lock() {
        if let Some(running) = server.take() {
            running.unblock();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(LanPreview::default())
        .invoke_handler(tauri::generate_handler![lan_preview_start, lan_preview_reports, lan_preview_stop])
        .run(tauri::generate_context!())
        .expect("Fehler beim Start des Editors");
}
