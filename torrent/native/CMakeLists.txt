cmake_minimum_required(VERSION 3.16)
project(swarmplay_native LANGUAGES CXX)

find_package(PkgConfig REQUIRED)
pkg_check_modules(LIBTORRENT REQUIRED IMPORTED_TARGET libtorrent-rasterbar)

add_library(swarmplay_native SHARED src/session_stub.cpp)
target_compile_features(swarmplay_native PRIVATE cxx_std_17)
target_include_directories(swarmplay_native PUBLIC include)
target_link_libraries(swarmplay_native PRIVATE PkgConfig::LIBTORRENT)
set_target_properties(swarmplay_native PROPERTIES OUTPUT_NAME swarmplay_native)
