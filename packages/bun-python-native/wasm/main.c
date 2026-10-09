#include <Python.h>
#include "modules.h"

int
main(int argc, char **argv)
{
    PyImport_FrozenModules = buv_frozen_modules;
    PyPreConfig preconfig;
    PyPreConfig_InitPythonConfig(&preconfig);
    preconfig.utf8_mode = 1;
    PyStatus status = Py_PreInitialize(&preconfig);
    if (PyStatus_Exception(status)) {
        Py_ExitStatusException(status);
    }

    PyConfig config;
    PyConfig_InitIsolatedConfig(&config);
    config.parse_argv = 0;
    config.site_import = 0;
    config.write_bytecode = 0;
    config.module_search_paths_set = 1;
    status = PyConfig_SetBytesArgv(&config, argc, argv);
    if (!PyStatus_Exception(status)) {
        status = PyConfig_SetString(&config, &config.home, L"/buv");
    }
    if (!PyStatus_Exception(status)) {
        status = Py_InitializeFromConfig(&config);
    }
    PyConfig_Clear(&config);
    if (PyStatus_Exception(status)) {
        Py_ExitStatusException(status);
    }

    PyObject *main_module = PyImport_AddModule("__main__");
    PyObject *filename = PyUnicode_FromString(buv_entry_filename);
    int exit_code = 0;
    if (main_module == NULL || filename == NULL ||
        PyObject_SetAttrString(main_module, "__file__", filename) < 0 ||
        PyImport_ImportFrozenModule("__main__") <= 0) {
        PyErr_Print();
        exit_code = 1;
    }
    Py_XDECREF(filename);
    if (Py_FinalizeEx() < 0) {
        exit_code = 120;
    }
    return exit_code;
}
