use bun_core::strings;

pub(crate) fn contains(value: &str, needle: &str) -> bool {
    needle.is_empty() || strings::contains(value.as_bytes(), needle.as_bytes())
}

pub(crate) fn find(value: &str, needle: &str) -> Option<usize> {
    if needle.is_empty() {
        Some(0)
    } else {
        strings::index_of(value.as_bytes(), needle.as_bytes())
    }
}

pub(crate) fn rfind(value: &str, needle: &str) -> Option<usize> {
    if needle.is_empty() {
        Some(value.len())
    } else {
        strings::last_index_of(value.as_bytes(), needle.as_bytes())
    }
}

pub(crate) fn split_once<'a>(value: &'a str, needle: &str) -> Option<(&'a str, &'a str)> {
    let index = find(value, needle)?;
    Some((&value[..index], &value[index + needle.len()..]))
}

pub(crate) fn rsplit_once<'a>(value: &'a str, needle: &str) -> Option<(&'a str, &'a str)> {
    let index = rfind(value, needle)?;
    Some((&value[..index], &value[index + needle.len()..]))
}

pub(crate) fn split<'a>(value: &'a str, needle: &'a str) -> impl Iterator<Item = &'a str> {
    assert!(!needle.is_empty(), "graph separators must be non-empty");
    strings::split(value.as_bytes(), needle.as_bytes())
        .map(|part| strings::str_utf8(part).expect("UTF-8 text split at a UTF-8 separator"))
}

pub(crate) fn rsplit<'a>(value: &'a str, needle: &'a str) -> impl Iterator<Item = &'a str> {
    assert!(!needle.is_empty(), "graph separators must be non-empty");
    strings::rsplit(value.as_bytes(), needle.as_bytes())
        .map(|part| strings::str_utf8(part).expect("UTF-8 text split at a UTF-8 separator"))
}

pub(crate) fn replace(value: &str, needle: &str, replacement: &str) -> String {
    if needle.is_empty() {
        let mut result = String::with_capacity(value.len());
        result.push_str(replacement);
        for character in value.chars() {
            result.push(character);
            result.push_str(replacement);
        }
        return result;
    }
    let capacity = strings::replacement_size(value.as_bytes(), needle.as_bytes(), replacement.as_bytes());
    let mut result = String::with_capacity(capacity);
    let mut remainder = value;
    while let Some((before, after)) = split_once(remainder, needle) {
        result.push_str(before);
        result.push_str(replacement);
        remainder = after;
    }
    result.push_str(remainder);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utf8_boundaries_empty_fields_and_search_offsets_are_preserved() {
        assert_eq!(split("/été/🐍/", "/").collect::<Vec<_>>(), ["", "été", "🐍", ""]);
        assert_eq!(rsplit("/été/🐍/", "/").collect::<Vec<_>>(), ["", "🐍", "été", ""]);
        assert_eq!(split_once("été::🐍::run", "::"), Some(("été", "🐍::run")));
        assert_eq!(rsplit_once("été::🐍::run", "::"), Some(("été::🐍", "run")));
        assert_eq!(find("été🐍", "🐍"), Some(5));
        assert_eq!(rfind("été🐍", ""), Some(9));
        assert!(contains("été🐍", ""));
        assert_eq!(replace("été::🐍::run", "::", "/"), "été/🐍/run");
        assert_eq!(replace("été", "", "."), ".é.t.é.");
    }
}
