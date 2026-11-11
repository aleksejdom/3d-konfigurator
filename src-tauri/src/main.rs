// Unter Windows kein zusätzliches Konsolenfenster im Release-Build.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    konfigurator_editor_lib::run()
}
