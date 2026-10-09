// C ABI over llama.cpp loaded by bun:llama through bun:ffi. Handles are opaque; no struct crosses the boundary.
#include "llama.h"

#include <algorithm>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

#if defined(_WIN32)
#define BUN_LLAMA_EXPORT extern "C" __declspec(dllexport)
#else
#define BUN_LLAMA_EXPORT extern "C" __attribute__((visibility("default")))
#endif

namespace {
thread_local std::string g_error;

void quiet_log(ggml_log_level level, const char *text, void *) {
  if (level == GGML_LOG_LEVEL_ERROR) g_error.assign(text);
}

struct Context {
  llama_context *ctx;
  const llama_vocab *vocab;
  int32_t n_batch;
};
} // namespace

BUN_LLAMA_EXPORT uint32_t bun_llama_abi_version(void) { return 1; }

BUN_LLAMA_EXPORT const char *bun_llama_last_error(void) { return g_error.c_str(); }

BUN_LLAMA_EXPORT void bun_llama_backend_init(void) {
  llama_log_set(quiet_log, nullptr);
  llama_backend_init();
}

BUN_LLAMA_EXPORT const char *bun_llama_system_info(void) { return llama_print_system_info(); }

BUN_LLAMA_EXPORT llama_model *bun_llama_model_load(const char *path, int32_t n_gpu_layers, int32_t use_mmap) {
  llama_model_params params = llama_model_default_params();
  params.n_gpu_layers = n_gpu_layers;
  params.load_mode = use_mmap != 0 ? LLAMA_LOAD_MODE_MMAP : LLAMA_LOAD_MODE_NONE;
  llama_model *model = llama_model_load_from_file(path, params);
  if (!model && g_error.empty()) g_error = "failed to load model";
  return model;
}

BUN_LLAMA_EXPORT void bun_llama_model_free(llama_model *model) { llama_model_free(model); }

BUN_LLAMA_EXPORT int32_t bun_llama_n_vocab(const llama_model *model) {
  return llama_vocab_n_tokens(llama_model_get_vocab(model));
}

BUN_LLAMA_EXPORT int32_t bun_llama_n_ctx_train(const llama_model *model) { return llama_model_n_ctx_train(model); }

BUN_LLAMA_EXPORT int32_t bun_llama_is_eog(const llama_model *model, int32_t token) {
  return llama_vocab_is_eog(llama_model_get_vocab(model), token) ? 1 : 0;
}

// Returns the token count, or the negated required capacity when `max` is too small.
BUN_LLAMA_EXPORT int32_t bun_llama_tokenize(const llama_model *model, const char *text, int32_t len, int32_t *out,
                                            int32_t max, int32_t add_special, int32_t parse_special) {
  return llama_tokenize(llama_model_get_vocab(model), text, len, out, max, add_special != 0, parse_special != 0);
}

// Returns the byte count, or the negated required capacity when `max` is too small. No NUL terminator.
BUN_LLAMA_EXPORT int32_t bun_llama_token_to_piece(const llama_model *model, int32_t token, char *buf, int32_t max,
                                                  int32_t special) {
  return llama_token_to_piece(llama_model_get_vocab(model), token, buf, max, 0, special != 0);
}

BUN_LLAMA_EXPORT int32_t bun_llama_detokenize(const llama_model *model, const int32_t *tokens, int32_t n, char *buf,
                                              int32_t max, int32_t remove_special, int32_t unparse_special) {
  return llama_detokenize(llama_model_get_vocab(model), tokens, n, buf, max, remove_special != 0,
                          unparse_special != 0);
}

BUN_LLAMA_EXPORT Context *bun_llama_context_new(llama_model *model, uint32_t n_ctx, uint32_t n_batch,
                                                int32_t n_threads) {
  llama_context_params params = llama_context_default_params();
  params.n_ctx = n_ctx;
  if (n_batch) params.n_batch = n_batch;
  if (n_threads > 0) params.n_threads = params.n_threads_batch = n_threads;
  llama_context *ctx = llama_init_from_model(model, params);
  if (!ctx) {
    if (g_error.empty()) g_error = "failed to create context";
    return nullptr;
  }
  return new Context{ctx, llama_model_get_vocab(model), (int32_t)llama_n_batch(ctx)};
}

BUN_LLAMA_EXPORT void bun_llama_context_free(Context *c) {
  if (!c) return;
  llama_free(c->ctx);
  delete c;
}

BUN_LLAMA_EXPORT uint32_t bun_llama_context_n_ctx(const Context *c) { return llama_n_ctx(c->ctx); }

// Forgets every decoded token so the context can start a new sequence.
BUN_LLAMA_EXPORT void bun_llama_context_reset(Context *c) { llama_memory_clear(llama_get_memory(c->ctx), true); }

// Feeds `n` tokens in `n_batch` chunks. Returns 0 on success, otherwise the llama_decode status.
BUN_LLAMA_EXPORT int32_t bun_llama_decode(Context *c, const int32_t *tokens, int32_t n) {
  for (int32_t i = 0; i < n; i += c->n_batch) {
    int32_t count = std::min(c->n_batch, n - i);
    std::vector<llama_token> chunk(tokens + i, tokens + i + count);
    int32_t status = llama_decode(c->ctx, llama_batch_get_one(chunk.data(), count));
    if (status != 0) {
      g_error = "llama_decode failed with status " + std::to_string(status);
      return status;
    }
  }
  return 0;
}

// temp <= 0 selects greedy decoding; top_k <= 0 and top_p >= 1 disable those stages.
BUN_LLAMA_EXPORT llama_sampler *bun_llama_sampler_new(float temp, int32_t top_k, float top_p, uint32_t seed) {
  llama_sampler *chain = llama_sampler_chain_init(llama_sampler_chain_default_params());
  if (temp <= 0.0f) {
    llama_sampler_chain_add(chain, llama_sampler_init_greedy());
    return chain;
  }
  if (top_k > 0) llama_sampler_chain_add(chain, llama_sampler_init_top_k(top_k));
  if (top_p < 1.0f) llama_sampler_chain_add(chain, llama_sampler_init_top_p(top_p, 1));
  llama_sampler_chain_add(chain, llama_sampler_init_temp(temp));
  llama_sampler_chain_add(chain, llama_sampler_init_dist(seed));
  return chain;
}

BUN_LLAMA_EXPORT void bun_llama_sampler_free(llama_sampler *s) { llama_sampler_free(s); }

// Samples the next token from the last decoded position and feeds it back. Returns -1 on a decode failure.
BUN_LLAMA_EXPORT int32_t bun_llama_next(Context *c, llama_sampler *s) {
  llama_token token = llama_sampler_sample(s, c->ctx, -1);
  llama_sampler_accept(s, token);
  if (llama_vocab_is_eog(c->vocab, token)) return token;
  if (bun_llama_decode(c, &token, 1) != 0) return -1;
  return token;
}
