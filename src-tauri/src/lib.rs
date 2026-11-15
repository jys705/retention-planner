// Rust 쪽은 창을 띄우고 플러그인을 등록하는 일, 그리고 웹뷰가 못 하는 파일 쓰기만 한다.
// 스케줄링과 저장은 전부 TypeScript 에 있다.
use std::fs::OpenOptions;
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};

use tauri::Manager;

/// 내보낸 파일을 다운로드 폴더에 쓰고, 쓴 경로를 돌려준다.
///
/// 웹뷰의 다운로드는 앱이 처리기를 달지 않으면 macOS 에서 조용히 취소된다. 내보내기를
/// 눌러도 아무 파일도 안 생기는 셈이라 여기서 직접 쓴다.
#[tauri::command]
fn save_to_downloads(app: tauri::AppHandle, name: String, contents: String) -> Result<String, String> {
    let dir = app.path().download_dir().map_err(|e| e.to_string())?;
    write_new_file(&dir, &name, &contents)
        .map(|path| path.display().to_string())
        .map_err(|e| e.to_string())
}

/// 폴더 안에 새 파일을 만든다. 같은 이름이 있으면 덮어쓰지 않고 뒤에 번호를 붙인다.
///
/// 이름은 화면에서 넘어온 값이라 파일 이름만 쓴다. 폴더가 섞여 있으면 떼어 낸다.
fn write_new_file(dir: &Path, name: &str, contents: &str) -> std::io::Result<PathBuf> {
    let file_name = Path::new(name)
        .file_name()
        .and_then(|n| n.to_str())
        .filter(|n| !n.is_empty())
        .unwrap_or("retention-planner.json");
    let (stem, ext) = match file_name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => (stem.to_string(), format!(".{ext}")),
        _ => (file_name.to_string(), String::new()),
    };
    std::fs::create_dir_all(dir)?;
    let mut n = 0;
    loop {
        let candidate = if n == 0 {
            dir.join(file_name)
        } else {
            dir.join(format!("{stem} ({n}){ext}"))
        };
        // 있는지 먼저 보고 쓰면 그 사이에 같은 이름이 생길 수 있다. 새로 만들 때만 연다.
        match OpenOptions::new().write(true).create_new(true).open(&candidate) {
            Ok(mut file) => {
                file.write_all(contents.as_bytes())?;
                return Ok(candidate);
            }
            Err(e) if e.kind() == ErrorKind::AlreadyExists => n += 1,
            Err(e) => return Err(e),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![save_to_downloads])
        .run(tauri::generate_context!())
        .expect("앱을 시작하지 못했습니다");
}

#[cfg(test)]
mod tests {
    use super::write_new_file;
    use std::path::PathBuf;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("rp-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn 같은_이름이_있으면_번호를_붙이고_덮어쓰지_않는다() {
        let dir = scratch("unique");
        let first = write_new_file(&dir, "backup.json", "첫째").unwrap();
        let second = write_new_file(&dir, "backup.json", "둘째").unwrap();
        assert_eq!(first, dir.join("backup.json"));
        assert_eq!(second, dir.join("backup (1).json"));
        assert_eq!(std::fs::read_to_string(&first).unwrap(), "첫째");
        assert_eq!(std::fs::read_to_string(&second).unwrap(), "둘째");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 이름에_섞인_폴더는_떼어_낸다() {
        let dir = scratch("strip");
        let path = write_new_file(&dir, "../../outside.json", "{}").unwrap();
        assert_eq!(path, dir.join("outside.json"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn 이름이_비면_기본_이름을_쓴다() {
        let dir = scratch("empty");
        let path = write_new_file(&dir, "", "{}").unwrap();
        assert_eq!(path, dir.join("retention-planner.json"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
