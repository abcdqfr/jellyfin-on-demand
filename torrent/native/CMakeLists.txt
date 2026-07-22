cmake_minimum_required(VERSION 3.16)
project(swarmplay_native LANGUAGES CXX)

find_package(PkgConfig REQUIRED)
pkg_check_modules(LIBTORRENT REQUIRED IMPORTED_TARGET libtorrent-rasterbar)

add_library(swarmplay_native SHARED src/session_stub.cpp src/mkv_probe.cpp)
target_compile_features(swarmplay_native PRIVATE cxx_std_17)
target_include_directories(swarmplay_native PUBLIC include)
target_link_libraries(swarmplay_native PRIVATE PkgConfig::LIBTORRENT)
set_target_properties(swarmplay_native PROPERTIES OUTPUT_NAME swarmplay_native)

# ADR-007: standalone unit tests for the MKV/EBML probe. Deliberately links
# only mkv_probe.cpp -- no libtorrent, no session_stub -- so the probe
# algorithm stays testable (and tested) without a running torrent session
# (INVARIANTS.md I8/I10: no engine/Go dependency, libtorrent only in the
# real session code, not in this pure-parsing unit).
add_executable(mkv_probe_test src/mkv_probe_test.cpp src/mkv_probe.cpp)
target_compile_features(mkv_probe_test PRIVATE cxx_std_17)
target_include_directories(mkv_probe_test PRIVATE src)
