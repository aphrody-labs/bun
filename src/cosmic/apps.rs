//! Installed applications (freedesktop-desktop-entry).

use std::collections::HashSet;
use std::path::PathBuf;

use freedesktop_desktop_entry::{DesktopEntry, Iter};

use crate::json::Json;

fn opt_list<'s>(j: &mut Json, values: Option<impl IntoIterator<Item = &'s str>>) {
    match values {
        Some(v) => j.strings(v),
        None => {
            j.begin_array();
            j.end_array();
        }
    }
}

pub(crate) fn desktop_entries(dirs: Vec<PathBuf>, locales: &[String]) -> Vec<u8> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut j = Json::default();
    j.begin_array();
    for path in Iter::new(dirs.into_iter()) {
        let Ok(entry) = DesktopEntry::from_path(path, Some(locales)) else {
            continue;
        };
        if !seen.insert(entry.appid.clone()) {
            continue;
        }
        j.begin_object();
        j.key("id");
        j.string(entry.id());
        j.key("path");
        j.string(&entry.path.to_string_lossy());
        j.key("type");
        j.opt_string(entry.type_());
        j.key("name");
        j.opt_string(entry.name(locales).as_deref());
        j.key("genericName");
        j.opt_string(entry.generic_name(locales).as_deref());
        j.key("comment");
        j.opt_string(entry.comment(locales).as_deref());
        j.key("icon");
        j.opt_string(entry.icon());
        j.key("exec");
        j.opt_string(entry.exec());
        j.key("tryExec");
        j.opt_string(entry.try_exec());
        j.key("workingDirectory");
        j.opt_string(entry.path());
        j.key("terminal");
        j.bool(entry.terminal());
        j.key("noDisplay");
        j.bool(entry.no_display());
        j.key("hidden");
        j.bool(entry.hidden());
        j.key("dbusActivatable");
        j.bool(entry.dbus_activatable());
        j.key("startupWMClass");
        j.opt_string(entry.startup_wm_class());
        j.key("categories");
        opt_list(&mut j, entry.categories());
        j.key("keywords");
        let keywords = entry.keywords(locales);
        opt_list(&mut j, keywords.as_ref().map(|k| k.iter().map(|s| &**s)));
        j.key("mimeTypes");
        opt_list(&mut j, entry.mime_type());
        j.key("onlyShowIn");
        opt_list(&mut j, entry.only_show_in());
        j.key("notShowIn");
        opt_list(&mut j, entry.not_show_in());
        j.key("actions");
        j.begin_array();
        for action in entry.actions().unwrap_or_default() {
            j.begin_object();
            j.key("id");
            j.string(action);
            j.key("name");
            j.opt_string(entry.action_name(action, locales).as_deref());
            j.key("exec");
            j.opt_string(entry.action_exec(action));
            j.end_object();
        }
        j.end_array();
        j.end_object();
    }
    j.end_array();
    j.finish()
}
