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
    SWARM_ERROR_UNAVAILABLE = -1,
    SWARM_ERROR_INVALID_ARGUMENT = -2,
    SWARM_ERROR_METADATA_TIMEOUT = -3,
    SWARM_ERROR_INVALID_FILE_INDEX = -4,
    SWARM_ERROR_IO = -5
};

/* source accepts a 40-character v1 infohash, magnet URI, or absolute .torrent path. */
int swarm_ensure(const char *source, int file_index, int tail_mib,
                 int head_mib, swarm_ensure_result *out);
int swarm_status(const char *source, swarm_status_result *out);
int swarm_stop(const char *source, int remove_files);
/* JSON array into json_out: [{"index":0,"size":1,"path":"a.mkv"},...] — requires metadata. */
int swarm_list_files(const char *source, char *json_out, int json_cap);

#ifdef __cplusplus
}
#endif

#endif
