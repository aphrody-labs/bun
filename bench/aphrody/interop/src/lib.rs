use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

fn sum_bytes(bytes: &[u8]) -> Result<f64, &'static str> {
    if !bytes.len().is_multiple_of(8) {
        return Err("expected little-endian float64 bytes");
    }
    Ok(bytes
        .as_chunks::<8>()
        .0
        .iter()
        .map(|chunk| f64::from_le_bytes(*chunk))
        .sum())
}

/// # Safety
/// `data` points to `length` readable bytes for the duration of this call.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bun_bench_sum_f64(data: *const u8, length: usize) -> f64 {
    if length == 0 {
        return 0.0;
    }
    if data.is_null() || length > isize::MAX as usize {
        return f64::NAN;
    }
    // SAFETY: the caller supplies a readable byte slice; the size fits isize.
    let bytes = unsafe { std::slice::from_raw_parts(data, length) };
    sum_bytes(bytes).unwrap_or(f64::NAN)
}

#[pyfunction(name = "sum_f64")]
fn python_sum(data: &[u8]) -> PyResult<f64> {
    sum_bytes(data).map_err(PyValueError::new_err)
}

#[pymodule]
fn bun_runtime_bench(module: &Bound<'_, PyModule>) -> PyResult<()> {
    module.add_function(wrap_pyfunction!(python_sum, module)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_binary_inputs_without_dereferencing_them() {
        assert!(sum_bytes(&[0; 7]).is_err());
        // SAFETY: null and oversized buffers are rejected before they are dereferenced.
        unsafe {
            assert_eq!(bun_bench_sum_f64(std::ptr::null(), 0), 0.0);
            assert!(bun_bench_sum_f64(std::ptr::null(), 8).is_nan());
            assert!(bun_bench_sum_f64(std::ptr::dangling(), usize::MAX).is_nan());
        }
    }

    #[test]
    fn c_abi_preserves_little_endian_signed_float64_values() {
        let bytes: Vec<u8> = [1.5_f64, -0.25, 2.0]
            .into_iter()
            .flat_map(f64::to_le_bytes)
            .collect();
        // SAFETY: the Vec owns the complete readable buffer throughout the call.
        assert_eq!(
            unsafe { bun_bench_sum_f64(bytes.as_ptr(), bytes.len()) },
            3.25
        );
        assert_eq!(sum_bytes(&bytes), Ok(3.25));
    }
}
