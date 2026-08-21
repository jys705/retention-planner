// Rust 쪽은 창을 띄우고 플러그인을 등록하는 일만 한다.
// 스케줄링과 저장은 전부 TypeScript 에 있다.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .run(tauri::generate_context!())
        .expect("앱을 시작하지 못했습니다");
}
