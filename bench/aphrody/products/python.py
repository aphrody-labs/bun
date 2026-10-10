import hashlib, json, os, sys, time
mode = os.environ.get("BENCH_MODE", "sum")
payload = json.dumps([{"id": i, "name": "item-" + str(i)} for i in range(2000)], separators=(",", ":"))
blob = bytes(range(256)) * 4096

def operation():
    if mode == "sum":
        return str(sum(range(100000)))
    if mode == "json":
        return str(sum(item["id"] for item in json.loads(payload)))
    if mode == "sha256":
        return hashlib.sha256(blob).hexdigest()
    if mode == "bridge":
        value = None
        for _ in range(10000):
            value = str(eval("20 + 22"))
        return value
    if mode == "startup":
        return "42"
    raise ValueError(mode)

for _ in range(5):
    operation()
start = time.perf_counter_ns()
for _ in range(10):
    __bench_value = operation()
__bench_work_ms = (time.perf_counter_ns() - start) / 1e6 / 10
if __name__ == "__main__":
    print("BENCH_RESULT " + json.dumps({"value": __bench_value, "workMs": __bench_work_ms}))

