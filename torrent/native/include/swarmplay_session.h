#ifndef SWARMPLAY_SESSION_H
#define SWARMPLAY_SESSION_H

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    const char *path;
    int ready;
    int err;
} swarm_ensure_result;

typedef struct {
    int ready;
    int err;
} swarm_status_result;

enum {
    SWARM_ERROR_UNAVAILABLE = -1
};

/* source accepts a 40-character v1 infohash, magnet URI, or absolute .torrent path. */
int swarm_ensure(const char *source, int file_index, int tail_mib,
                 int head_mib, swarm_ensure_result *out);
int swarm_status(const char *source, swarm_status_result *out);
int swarm_stop(const char *source, int remove_files);

#ifdef __cplusplus
}
#endif

#endif
