#ifndef JELLYFIN_ON_DEMAND_SESSION_H
#define JELLYFIN_ON_DEMAND_SESSION_H

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
    /* Append-only ABI fields (native half of status-surface). */
    int has_metadata;
    int num_peers;
    int num_seeds;
    int dht_nodes;
    /* 0..1 fraction of the target file's pieces on disk (0.4 cache-to-library). */
    float progress;
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

/* 0.4 cache-to-library: download exactly one file (whole-file, normal
 * priority, no extent-gate/warm dance -- this is archival, not playback)
 * straight into dest_dir instead of the ephemeral swarm cache. Tracked as
 * its own entry (source+file_index), independent of any concurrent
 * swarm_ensure() stream of the same torrent. Poll swarm_cache_status() for
 * progress/ready; ready=1 means the whole target file is on disk. */
int swarm_cache_ensure(const char *source, int file_index, const char *dest_dir,
                       swarm_ensure_result *out);
int swarm_cache_status(const char *source, int file_index, swarm_status_result *out);

#ifdef __cplusplus
}
#endif

#endif
