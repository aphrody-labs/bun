# SPDX-License-Identifier: Apache-2.0
# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["torch==2.11.0+cpu", "transformers==5.10.2", "safetensors==0.8.0", "accelerate==1.15.0", "pillow==12.3.0"]
# [tool.uv.sources]
# torch = { index = "pytorch-cpu" }
# [[tool.uv.index]]
# name = "pytorch-cpu"
# url = "https://download.pytorch.org/whl/cpu"
# explicit = true
# ///
"""Controlled adapter for the unchanged, audited Clef joint-schema model."""
from __future__ import annotations

import argparse
import ast
import hashlib
import importlib.metadata
import importlib.util
import json
import math
import os
from pathlib import Path
import struct
import sys

REVISION = "8b2e5fd17c09fd49bc2880b805d5323ec7ff4ff3"
RECEIPT_SHA = "696fc87f2f4b99c07ee6effc26f68b6ea4b271184dac6b890915b9809b8fb6bb"
CODE_SHA = "0e304cf7c6500e8bb59bef7e2afd2c6373f82596dfb3b57d1aa93c175e2dc3a3"
HEAD_SHA = "19cdcec8c81dc9212be320fff47462ab342fbc1278be4368fb3da71241cf5ba0"
DEPENDENCIES = {"torch": "2.11.0+cpu", "transformers": "5.10.2", "safetensors": "0.8.0", "accelerate": "1.15.0", "pillow": "12.3.0"}


def digest(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            result.update(chunk)
    return result.hexdigest()


def original(store: Path, full_rehash: bool = False):
    receipt_path = store / "acquisition.json"
    if receipt_path.stat().st_size > 1048576 or digest(receipt_path) != RECEIPT_SHA:
        raise ValueError("Clef acquisition receipt checksum mismatch")
    receipt = json.loads(receipt_path.read_text())
    if (receipt.get("repository") != "Cloudflare/clef-flash"
            or receipt.get("revision") != REVISION
            or receipt.get("complete") is not True
            or receipt.get("completelyRehashed") is not True):
        raise ValueError("Clef requires its completely rehashed immutable original")
    model = Path(receipt["modelPath"])
    if not model.is_dir() or not model.resolve().is_relative_to(store.resolve()):
        raise ValueError("Pinned local Clef snapshot is absent or outside its store")
    for entry in receipt["files"]:
        path = (model / entry["name"]).resolve()
        if not path.is_relative_to(store.resolve()) or path.stat().st_size != entry["bytes"]:
            raise ValueError("Clef file leaves its protected store or changed size")
        if full_rehash or entry["name"] in ("joint_schema_model.py", "joint_head.safetensors", "joint_head_config.json"):
            if digest(path) != entry["sha256"]:
                raise ValueError("Clef file SHA-256 mismatch")
    if digest(model / "joint_schema_model.py") != CODE_SHA:
        raise ValueError("Original joint-schema code identity changed")
    return model, receipt


def inspect(model: Path):
    code = ast.parse((model / "joint_schema_model.py").read_text())
    classes = {node.name for node in code.body if isinstance(node, ast.ClassDef)}
    required = {"EncodedQuestion", "EncodedRecord", "EvidenceRoutingLayer", "JointSchemaHead", "ClefModel"}
    if not required.issubset(classes):
        raise ValueError("Original joint-head owner classes are missing")
    path = model / "joint_head.safetensors"
    with path.open("rb") as stream:
        raw = stream.read(8)
        if len(raw) != 8:
            raise ValueError("Truncated safetensors header")
        size, = struct.unpack("<Q", raw)
        if not 2 <= size <= 1048576:
            raise ValueError("Safetensors header exceeds bound")
        header_bytes = stream.read(size)
        if len(header_bytes) != size:
            raise ValueError("Truncated safetensors metadata")
        header = json.loads(header_bytes)
    tensors, parameters, end, dtypes = 0, 0, 0, set()
    ranges = []
    widths = {"BF16": 2, "F16": 2, "F32": 4}
    for name, value in header.items():
        if name == "__metadata__":
            continue
        shape, offsets, dtype = value["shape"], value["data_offsets"], value["dtype"]
        if dtype not in widths or any(not isinstance(v, int) or isinstance(v, bool) or v < 0 for v in shape):
            raise ValueError("Unexpected joint-head tensor shape or dtype")
        count = math.prod(shape)
        if len(offsets) != 2 or not all(isinstance(v, int) and not isinstance(v, bool) for v in offsets):
            raise ValueError("Invalid joint-head tensor offsets")
        first, last = offsets
        if first < 0 or last < first or last - first != count * widths[dtype]:
            raise ValueError("Joint-head tensor byte span disagrees with shape")
        ranges.append((first, last)); end = max(end, last)
        parameters += count; tensors += 1; dtypes.add(dtype)
    cursor = 0
    for first, last in sorted(ranges):
        if first != cursor:
            raise ValueError("Joint-head tensors overlap or have an unaccounted gap")
        cursor = last
    if 8 + size + end != path.stat().st_size or not tensors or not parameters:
        raise ValueError("Joint-head file closure is incomplete")
    config = json.loads((model / "joint_head_config.json").read_text())
    return {"mode": "inspect", "sourceRevision": REVISION, "originalCodeSHA256": CODE_SHA,
            "jointHeadSHA256": HEAD_SHA, "headConfig": config, "tensorCount": tensors,
            "parameters": parameters, "dtypes": sorted(dtypes),
            "originalCodeExecuted": False, "backboneLoaded": False, "trained": False}


def module(model: Path):
    for name, version in DEPENDENCIES.items():
        if importlib.metadata.version(name) != version:
            raise ValueError("Native head dependency pin mismatch: " + name)
    spec = importlib.util.spec_from_file_location("bun_clef_original", model / "joint_schema_model.py")
    if spec is None or spec.loader is None:
        raise ValueError("Original Clef module cannot be loaded")
    owner = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = owner
    spec.loader.exec_module(owner)
    return owner


def probe(model: Path):
    import torch
    from safetensors.torch import load_file
    torch.set_num_threads(1); torch.set_num_interop_threads(1); torch.manual_seed(7)
    owner = module(model)
    config = json.loads((model / "joint_head_config.json").read_text())
    head = owner.JointSchemaHead(**config).to(dtype=torch.float32, device="cpu")
    head.load_state_dict(load_file(str(model / "joint_head.safetensors")), strict=True)
    head.train()
    question = owner.EncodedQuestion("gate", 0, (0, 2), ((2, 4), (4, 6)), ("true", "false"))
    record = owner.EncodedRecord(tuple(range(8)), (question,), "synthetic-head-mechanism-fixture")
    hidden = torch.randn(1, 8, config["hidden_size"])
    inputs = torch.tensor([record.input_ids]); attention = torch.ones_like(inputs)
    lexical = torch.randn(8, config["hidden_size"])
    optimizer = torch.optim.SGD(head.parameters(), lr=1e-4)
    before = head.residual_gate.detach().clone()
    logits = head(hidden, inputs, attention, [record], lexical)[0][0]
    if logits.shape != (2,) or not torch.isfinite(logits).all():
        raise ValueError("Original joint head returned invalid option logits")
    loss = torch.nn.functional.cross_entropy(logits.float().unsqueeze(0), torch.tensor([0]))
    loss.backward()
    gradients = [p.grad for p in head.parameters() if p.grad is not None]
    if not gradients or not all(torch.isfinite(g).all() for g in gradients) or not any(torch.count_nonzero(g) for g in gradients):
        raise ValueError("Original joint-head gradients are absent or non-finite")
    optimizer.step()
    changed = not torch.equal(before, head.residual_gate.detach())
    if not changed:
        raise ValueError("Head optimizer mechanism did not update the tested parameter")
    return {"mode": "probe", "originalCodeExecuted": True, "originalCodeSHA256": CODE_SHA,
            "jointHeadSHA256": HEAD_SHA, "backboneLoaded": False, "syntheticInput": True,
            "optionLogits": logits.detach().float().tolist(), "loss": loss.item(),
            "gradientParameterCount": len(gradients), "optimizerStepObserved": True,
            "trained": False, "artifactQualified": False}


def public_records(path: Path, limit: int):
    certificate = json.loads(Path(str(path) + ".manifest.json").read_text())
    if certificate.get("sha256") != digest(path) or certificate.get("trained") is not False:
        raise ValueError("Public training record receipt mismatch")
    manifest_hash = certificate["sourceManifestSHA256"]
    selected = {"train": [], "validation": [], "test": []}
    sources = {(entry["repository"], entry["revision"]) for entry in certificate["sources"]}
    if len(sources) != 2 or {repo for repo, _ in sources} != {"oven-sh/bun", "aphrody-labs/bun"}:
        raise ValueError("Training source certificate requires both public Bun owners")
    file_splits = {}
    with path.open() as stream:
        for line in stream:
            if len(line.encode()) > 4 * 1024 * 1024:
                raise ValueError("Training row exceeds byte limit")
            record = json.loads(line)
            split, file_sha = record["split"], record["fileSHA256"]
            if split not in selected or len(file_sha) != 64 or record.get("sourceManifestSHA256") != manifest_hash:
                raise ValueError("Foreign training source or split")
            if record.get("provenance") != "public-git-owner-path" or record.get("behaviorExecuted") is not False:
                raise ValueError("Training record has no source-owner evidence")
            if not record.get("owners") or any((o["repository"], o["revision"]) not in sources for o in record["owners"]):
                raise ValueError("Training records are outside public Bun")
            previous = file_splits.setdefault(file_sha, split)
            if previous != split:
                raise ValueError("Identical source content leaks across train/evaluation")
            if record.get("evaluation") != "code-agent":
                continue  # Image/video evaluations require actual public Bun media, not text or LFS pointers.
            if len(selected[split]) < limit:
                selected[split].append(record)
    if not all(selected.values()):
        raise ValueError("Training requires separate source-group validation and test sets")
    return selected, certificate


def train(model: Path, records: Path, output: Path, max_steps: int):
    import torch
    from safetensors.torch import save_file
    if not 1 <= max_steps <= 128:
        raise ValueError("Invalid pilot training step limit")
    available = next(int(line.split()[1]) * 1024 for line in Path("/proc/meminfo").read_text().splitlines() if line.startswith("MemAvailable:"))
    if available < 28 * 1024**3:
        raise ValueError("Frozen bf16 backbone requires at least 28 GiB measured available RAM")
    if output.exists():
        raise ValueError("A trained artifact is immutable; select a new protected output")
    if not output.parent.resolve().is_relative_to(Path.home() / ".aphrody" / "models"):
        raise ValueError("Trained weights belong to the protected model owner store")
    selected, certificate = public_records(records, max_steps)
    torch.set_num_threads(1); torch.set_num_interop_threads(1); torch.manual_seed(7)
    owner = module(model)
    # This existing owner loads only the exact local snapshot; offline environment and local_files_only
    # also constrain AutoProcessor's original call. No remote custom code is allowed.
    clef, processor = owner.load_release_model(str(model), device="cpu", dtype=torch.bfloat16,
                                               local_files_only=True, trust_remote_code=False)
    for parameter in clef.language_model.parameters():
        parameter.requires_grad_(False)
    clef.language_model.eval(); clef.head.train()
    def fingerprint():
        result = hashlib.sha256()
        for name, value in sorted(clef.head.state_dict().items()):
            result.update(name.encode())
            result.update(memoryview(value.detach().contiguous().reshape(-1).view(torch.uint8).numpy()))
        return result.hexdigest()
    initial_head_fingerprint = fingerprint()
    optimizer = torch.optim.AdamW(clef.head.parameters(), lr=1e-5)
    steps, losses = 0, []
    def run(record):
        encoded = owner.encode_record(processor.tokenizer, record, max_length=512, max_state_tokens=256, processor=processor)
        batch = owner.collate_records([encoded], processor.tokenizer.pad_token_id, torch.device("cpu"))
        logits = clef(batch)[0]
        return encoded, logits
    for record in selected["train"]:
        optimizer.zero_grad(set_to_none=True)
        encoded, logits = run(record)
        terms = []
        for question, values in zip(encoded.questions, logits, strict=True):
            target = question.option_ids.index(record["targets"][question.question_id])
            terms.append(torch.nn.functional.cross_entropy(values.float().unsqueeze(0), torch.tensor([target])))
        loss = torch.stack(terms).mean()
        if not torch.isfinite(loss):
            raise ValueError("Non-finite joint-head training loss")
        loss.backward()
        if any(p.grad is not None and not torch.isfinite(p.grad).all() for p in clef.head.parameters()):
            raise ValueError("Non-finite joint-head training gradient")
        torch.nn.utils.clip_grad_norm_(clef.head.parameters(), 1.0, error_if_nonfinite=True)
        optimizer.step(); steps += 1; losses.append(loss.item())
    clef.head.eval()
    evaluations = {}
    with torch.inference_mode():
        for split in ("validation", "test"):
            correct, total, losses_eval = 0, 0, []
            for record in selected[split]:
                encoded, logits = run(record)
                for question, values in zip(encoded.questions, logits, strict=True):
                    target = question.option_ids.index(record["targets"][question.question_id])
                    correct += int(values.argmax().item() == target); total += 1
                    losses_eval.append(torch.nn.functional.cross_entropy(values.float().unsqueeze(0), torch.tensor([target])).item())
            evaluations[split] = {"correct": correct, "questions": total, "accuracy": correct / total,
                                  "crossEntropy": sum(losses_eval) / len(losses_eval), "suite": "code-agent-owner-routing"}
    if not steps or fingerprint() == initial_head_fingerprint:
        raise ValueError("No real optimizer step changed the joint-head tensor values")
    output.mkdir(mode=0o700, parents=True)
    artifact = output / "joint_head.safetensors"
    save_file({name: value.detach().contiguous().cpu() for name, value in clef.head.state_dict().items()}, str(artifact))
    artifact.chmod(0o600)
    receipt = {"mode": "train", "sourceRevision": REVISION, "originalCodeSHA256": CODE_SHA,
               "baseJointHeadSHA256": HEAD_SHA, "sourceManifestSHA256": certificate["sourceManifestSHA256"],
               "recordsSHA256": certificate["sha256"], "optimizerSteps": steps, "losses": losses,
               "backboneFrozen": True, "backboneLoaded": True, "jointHeadUpdated": True,
               "artifactSHA256": digest(artifact), "artifactBytes": artifact.stat().st_size,
               "evaluations": evaluations, "multimodalEvaluated": False, "allSourceRecordsTrained": False,
               "trained": True, "artifactQualified": False, "calibrated": False,
               "labels": "deterministic source-owner roles; no learned Bun identity or behavioral guarantee"}
    target = output / "training.json"
    target.write_text(json.dumps(receipt, indent=2) + "\n"); target.chmod(0o600)
    return receipt


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("inspect", "probe", "train"), required=True)
    parser.add_argument("--store", type=Path, required=True)
    parser.add_argument("--records", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--max-steps", type=int, default=16)
    args = parser.parse_args()
    for variable in ("HF_HUB_OFFLINE", "TRANSFORMERS_OFFLINE"):
        if os.environ.get(variable) != "1":
            raise ValueError("Clef execution requires explicit offline model mode")
    model, _ = original(args.store, full_rehash=args.mode == "train")
    if args.mode == "inspect":
        result = inspect(model)
    elif args.mode == "probe":
        result = probe(model)
    else:
        if args.records is None or args.output is None:
            raise ValueError("Training requires public record evidence and protected output")
        result = train(model, args.records, args.output, args.max_steps)
    print(json.dumps(result, separators=(",", ":")))


if __name__ == "__main__":
    main()
