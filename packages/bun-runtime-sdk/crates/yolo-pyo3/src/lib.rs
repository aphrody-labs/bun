// Standalone host outside Bun's event loop: std I/O, collections and strings are intended here, as in bun_host and bun_docker.
#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    clippy::disallowed_macros,
)]

use pyo3::prelude::*;
use yolo_core::{compute_sum_squares, compute_summary};

#[pyfunction]
fn parallel_sum_squares(py: Python<'_>, values: Vec<f64>) -> PyResult<f64> {
  let result = py.detach(move || compute_sum_squares(&values));
  Ok(result)
}

#[pyfunction]
fn parallel_summary(py: Python<'_>, values: Vec<f64>) -> PyResult<(f64, f64, f64, f64)> {
  let result = py.detach(move || compute_summary(&values));
  Ok(result)
}

#[pymodule]
fn _yolo_native(m: &Bound<'_, PyModule>) -> PyResult<()> {
  m.add_function(wrap_pyfunction!(parallel_sum_squares, m)?)?;
  m.add_function(wrap_pyfunction!(parallel_summary, m)?)?;
  Ok(())
}
