pub(crate) fn dispatch() -> Option<i32> {
    dispatch_for(b"curl", false)
}

pub(crate) fn dispatch_internal() -> Option<i32> {
    dispatch_for(b"--bun-internal-curl", true)
}

fn dispatch_for(marker: &[u8], internal: bool) -> Option<i32> {
    let args = bun_core::argv();
    let program = args
        .get(0)?
        .as_bytes()
        .rsplit(|byte| matches!(*byte, b'/' | b'\\'))
        .next()?;
    if !internal
        && matches!(
            program,
            b"bunx"
                | b"bunx.exe"
                | b"node"
                | b"node.exe"
                | b"npm"
                | b"npm.exe"
                | b"npx"
                | b"npx.exe"
        )
    {
        return None;
    }
    if args.get(1).map(|arg| arg.as_bytes()) != Some(marker) {
        return None;
    }
    #[cfg(not(feature = "curl_native"))]
    {
        bun_core::pretty_errorln!("bun curl requires a build with --curl-native=on");
        Some(2)
    }
    #[cfg(feature = "curl_native")]
    {
        let mut arguments: Vec<Vec<u8>> = vec![b"curl".to_vec()];
        arguments.extend(
            (2..args.len()).map(|index| args.get(index).expect("argv index").as_bytes().to_vec()),
        );
        let count = match i32::try_from(arguments.len()) {
            Ok(count) => count,
            Err(_) => return Some(2),
        };
        #[cfg(not(windows))]
        {
            let mut strings: Vec<std::ffi::CString> =
                match arguments.into_iter().map(std::ffi::CString::new).collect() {
                    Ok(strings) => strings,
                    Err(_) => return Some(2),
                };
            let mut pointers: Vec<*mut core::ffi::c_char> = strings
                .iter_mut()
                .map(|value| value.as_ptr().cast_mut())
                .collect();
            pointers.push(core::ptr::null_mut());
            // The upstream entry executes only before VM startup; argv storage lives throughout it.
            Some(unsafe { super::ffi::BunCurlMain(count, pointers.as_mut_ptr()) })
        }
        #[cfg(windows)]
        {
            let mut strings: Vec<Vec<u16>> = arguments
                .into_iter()
                .map(|value| {
                    let mut wide = bun_core::strings::wtf8_to_utf16_alloc(&value)
                        .unwrap_or_else(|| value.iter().copied().map(u16::from).collect());
                    wide.push(0);
                    wide
                })
                .collect();
            let mut pointers: Vec<*mut u16> =
                strings.iter_mut().map(|value| value.as_mut_ptr()).collect();
            pointers.push(core::ptr::null_mut());
            // The embedded Windows tool keeps its upstream Unicode entry point.
            Some(unsafe { super::ffi::BunCurlMain(count, pointers.as_mut_ptr()) })
        }
    }
}
