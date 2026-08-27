#[cfg(desktop)]
use serde::Serialize;
#[cfg(desktop)]
use std::fs;
#[cfg(desktop)]
use std::path::PathBuf;
#[cfg(desktop)]
use sysinfo::System;
#[cfg(desktop)]
use tauri::Manager;

#[cfg(desktop)]
#[derive(Serialize)]
struct HardwareInfo {
    os: String,
    cpu: String,
    logical_cores: usize,
    physical_cores: usize,
    total_memory_gb: f64,
    gpus: Vec<GpuInfo>,
}

#[cfg(desktop)]
#[derive(Serialize)]
struct GpuInfo {
    name: String,
    vram_mb: u64,
}

#[cfg(desktop)]
fn config_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    Some(dir.join("server.json"))
}

#[cfg(desktop)]
#[tauri::command]
fn get_server_url(app: tauri::AppHandle) -> String {
    config_path(&app)
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v["url"].as_str().map(String::from))
        .unwrap_or_default()
}

#[cfg(desktop)]
#[tauri::command]
fn set_server_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let url = url.trim().trim_end_matches('/').to_string();
    if !url.is_empty() && !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("URL must start with http:// or https://".into());
    }
    let path = config_path(&app).ok_or("no config dir")?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::write(&path, serde_json::json!({ "url": url }).to_string()).map_err(|e| e.to_string())
}

/// Reports the machine's compute/encode capabilities on desktop; mobile uses
/// the browser media stack directly.
#[cfg(desktop)]
#[tauri::command]
fn hardware_info() -> HardwareInfo {
    use sysinfo::Disks;

    let mut sys = System::new_all();
    sys.refresh_all();

    let gpus = detect_gpus();
    // Disks import kept for future capture-buffer sizing; avoid unused warning.
    let _ = Disks::new_with_refreshed_list();

    let cpu_brand = sys
        .cpus()
        .first()
        .map(|c| c.brand().trim().to_string())
        .unwrap_or_else(|| "unknown CPU".into());
    let cores = sys.physical_core_count().unwrap_or(sys.cpus().len());

    HardwareInfo {
        os: System::long_os_version().unwrap_or_else(|| "unknown".into()),
        logical_cores: sys.cpus().len(),
        physical_cores: cores,
        cpu: cpu_brand,
        total_memory_gb: (sys.total_memory() as f64 / 1024f64.powi(3) * 10.).round() / 10.,
        gpus,
    }
}

#[cfg(desktop)]
fn detect_gpus() -> Vec<GpuInfo> {
    #[cfg(target_os = "windows")]
    {
        let out = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name + '|' + [math]::Round($_.AdapterRAM / 1MB) }",
            ])
            .output();
        if let Ok(o) = out {
            let text = String::from_utf8_lossy(&o.stdout);
            return text
                .lines()
                .filter_map(|l| {
                    let (name, vram) = l.trim().split_once('|')?;
                    Some(GpuInfo {
                        name: name.to_string(),
                        vram_mb: vram.parse().unwrap_or(0),
                    })
                })
                .collect();
        }
    }
    #[cfg(target_os = "macos")]
    {
        let out = std::process::Command::new("system_profiler")
            .args(["SPDisplaysDataType", "-json"])
            .output();
        if let Ok(o) = out {
            if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&o.stdout) {
                if let Some(items) = v["SPDisplaysDataType"].as_array() {
                    return items
                        .iter()
                        .filter_map(|d| {
                            Some(GpuInfo {
                                name: d["sppci_model"].as_str()?.to_string(),
                                vram_mb: d["spdisplays_vram_shared"]
                                    .as_str()
                                    .and_then(parse_mac_vram)
                                    .unwrap_or(0),
                            })
                        })
                        .collect();
                }
            }
        }
    }
    Vec::new()
}

#[cfg(target_os = "macos")]
fn parse_mac_vram(s: &str) -> Option<u64> {
    let (num, unit) = s.split_once(' ')?;
    let n: f64 = num.replace(",", "").parse().ok()?;
    Some(match unit.to_lowercase().as_str() {
        "gb" => (n * 1024.) as u64,
        "mb" => n as u64,
        _ => 0,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            #[cfg(desktop)]
            get_server_url,
            #[cfg(desktop)]
            set_server_url,
            #[cfg(desktop)]
            hardware_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running visio desktop");
}
