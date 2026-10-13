#include <mpv/client.h>
#include <stdint.h>
#include <stdio.h>
#include <time.h>

#define CHECK(condition)                                                       \
  do {                                                                         \
    if (!(condition)) {                                                        \
      fprintf(stderr, "MPV probe failed at line %d\n", __LINE__);              \
      return 1;                                                                \
    }                                                                          \
  } while (0)

int main(int argc, char **argv) {
  CHECK(argc == 2);
  const unsigned long api = mpv_client_api_version();
  CHECK((api >> 16) == 2 && (api & 0xffff) >= 5);
  mpv_handle *client = mpv_create();
  CHECK(client != NULL);
  CHECK(mpv_set_option_string(client, "config", "no") == 0);
  CHECK(mpv_set_option_string(client, "vo", "null") == 0);
  CHECK(mpv_set_option_string(client, "ao", "null") == 0);
  CHECK(mpv_set_option_string(client, "hwdec", "no") == 0);
  CHECK(mpv_set_option_string(client, "vd-lavc-threads", "1") == 0);
  CHECK(mpv_initialize(client) == 0);
  const char *command[] = {"loadfile", argv[1], NULL};
  CHECK(mpv_command(client, command) == 0);
  struct timespec clock;
  CHECK(clock_gettime(CLOCK_MONOTONIC, &clock) == 0);
  const time_t deadline = clock.tv_sec + 15;
  int loaded = 0, paused = 0, dimensions = 0, eof = 0;
  while (!eof) {
    CHECK(clock_gettime(CLOCK_MONOTONIC, &clock) == 0 &&
          clock.tv_sec < deadline);
    mpv_event *event = mpv_wait_event(client, 0.1);
    if (event->event_id == MPV_EVENT_FILE_LOADED)
      loaded = 1;
    if (loaded && !dimensions) {
      int64_t width = 0, height = 0;
      if (mpv_get_property(client, "video-params/w", MPV_FORMAT_INT64,
                           &width) == 0 &&
          mpv_get_property(client, "video-params/h", MPV_FORMAT_INT64,
                           &height) == 0) {
        CHECK(width == 64 && height == 64);
        dimensions = 1;
        int pause = 1, actual = 0;
        CHECK(mpv_set_property(client, "pause", MPV_FORMAT_FLAG, &pause) == 0);
        CHECK(mpv_get_property(client, "pause", MPV_FORMAT_FLAG, &actual) ==
                  0 &&
              actual == 1);
        pause = 0;
        CHECK(mpv_set_property(client, "pause", MPV_FORMAT_FLAG, &pause) == 0);
        paused = 1;
      }
    }
    if (event->event_id == MPV_EVENT_END_FILE) {
      mpv_event_end_file *end = event->data;
      CHECK(end && end->reason == MPV_END_FILE_REASON_EOF && end->error == 0);
      eof = 1;
    }
  }
  CHECK(loaded && dimensions && paused && eof);
  mpv_terminate_destroy(client);
  puts("MPV_API_PASS major=2 minor>=5 cpu=64x64 pause=roundtrip end=EOF");
  return 0;
}
