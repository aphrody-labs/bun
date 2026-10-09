use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

fn sum_bytes(bytes: &[u8]) -> Result<f64, &'static str> {
    if !bytes.len().is_multiple_of(8) {
        return Err("expected little-endian float64 bytes");
    }
    Ok(bytes
        .chunks_exact(8)
        .map(|chunk| f64::from_le_bytes(chunk.try_into().expect("eight-byte chunk")))
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
