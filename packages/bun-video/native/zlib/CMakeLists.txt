cmake_minimum_required(VERSION 3.20)
project(BunVideoZlib LANGUAGES C)

if(NOT BUN_ZLIB_SOURCE)
  message(FATAL_ERROR "BUN_ZLIB_SOURCE must select the existing Bun zlib vendor")
endif()

set(ZLIB_COMPAT ON CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS ON CACHE BOOL "" FORCE)
set(BUILD_TESTING OFF CACHE BOOL "" FORCE)
add_subdirectory("${BUN_ZLIB_SOURCE}" vendor-zlib)

if(WIN32)
  set_target_properties(zlib-ng PROPERTIES ARCHIVE_OUTPUT_NAME z)
endif()
