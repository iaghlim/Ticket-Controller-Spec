mod commands;
mod docx;
mod domain;

use commands::attachments::{add_attachment, list_attachments, remove_attachment};
use commands::checklist::{get_checklist, save_checklist};
use commands::clients::{create_client, delete_client, rename_client};
use commands::cloud_sync::apply_cloud_pull_cmd;
use commands::config_cmds::{get_config, open_path, scan_workspace_cmd, set_root_path, update_config};
use commands::documents::{
    add_draft_print, add_draft_print_bytes, attach_document, generate_document, list_draft_prints,
    read_draft, read_workspace_file_base64, remove_draft_print, save_draft,
    set_active_document_history,
};
use commands::notes::{read_notes_cmd, write_notes_cmd};
use commands::search::search;
use commands::snippets::{get_snippets, save_snippets};
use commands::tickets::{
    create_ticket, delete_ticket, duplicate_ticket, get_ticket, repair_ticket_meta,
    update_ticket_meta,
};
use commands::hours_report::{export_week_hours_csv, get_workspace_hours_report};
use commands::timer::{
    add_manual_entry, close_timer_overlay, delete_hours_entry, export_hours_csv, focus_main_window,
    get_active_timer, init_timer_state, list_hours, pause_timer, set_timer_note,
    set_timer_overlay_compact, show_timer_overlay, start_timer, stop_timer,
};
use commands::zip_ops::{export_ticket_zip, import_ticket_zip};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let state = init_timer_state(&app.handle());
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            set_root_path,
            update_config,
            scan_workspace_cmd,
            open_path,
            create_client,
            rename_client,
            delete_client,
            create_ticket,
            apply_cloud_pull_cmd,
            get_ticket,
            update_ticket_meta,
            delete_ticket,
            repair_ticket_meta,
            duplicate_ticket,
            get_checklist,
            save_checklist,
            read_notes_cmd,
            write_notes_cmd,
            list_attachments,
            add_attachment,
            remove_attachment,
            read_draft,
            save_draft,
            list_draft_prints,
            add_draft_print,
            add_draft_print_bytes,
            remove_draft_print,
            generate_document,
            read_workspace_file_base64,
            attach_document,
            set_active_document_history,
            search,
            get_snippets,
            save_snippets,
            export_ticket_zip,
            import_ticket_zip,
            get_active_timer,
            start_timer,
            pause_timer,
            stop_timer,
            set_timer_note,
            list_hours,
            add_manual_entry,
            delete_hours_entry,
            export_hours_csv,
            get_workspace_hours_report,
            export_week_hours_csv,
            show_timer_overlay,
            focus_main_window,
            close_timer_overlay,
            set_timer_overlay_compact,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar SpecDriven");
}
