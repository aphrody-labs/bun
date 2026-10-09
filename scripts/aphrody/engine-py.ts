export const pythonGraphProgram = String.raw`
import ast
import hashlib
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
paths = json.loads(pathlib.Path(sys.argv[2]).read_text(encoding="utf-8"))
nodes = []
links = []
coverage = {"files": len(paths), "parsed": 0, "syntaxErrors": [], "astNodes": 0, "calls": 0, "imports": 0, "definitions": 0}
modules = {}

def module_name(path):
    parts = list(pathlib.PurePosixPath(path).with_suffix("").parts)
    if parts[0] == "Lib":
        parts.pop(0)
    if parts[-1] == "__init__":
        parts.pop()
    return ".".join(parts)

for path in paths:
    modules.setdefault(module_name(path), []).append("file:" + path)

references = {}

def reference(kind, label):
    key = kind + ":" + label
    if key not in references:
        references[key] = "python:reference:" + key
        nodes.append({"id": references[key], "label": label, "kind": kind, "provenance": "UNRESOLVED"})
    return references[key]

class GraphVisitor(ast.NodeVisitor):
    def __init__(self, path):
        self.path = path
        self.scope = "file:" + path

    def capture(self, node, kind, label):
        identifier = f"{self.path}:python:{kind}:{node.lineno}:{node.col_offset}:{node.end_lineno}:{node.end_col_offset}"
        nodes.append({"id": identifier, "label": label, "kind": kind, "source_file": self.path,
                      "source_location": f"L{node.lineno}", "column": node.col_offset,
                      "end_line": node.end_lineno, "end_column": node.end_col_offset, "provenance": "EXTRACTED"})
        links.append({"source": self.scope, "target": identifier, "relation": "contains", "confidence": "EXTRACTED", "confidence_score": 1})
        return identifier

    def definition(self, node, kind):
        identifier = self.capture(node, kind, node.name)
        coverage["definitions"] += 1
        for decorator in node.decorator_list:
            self.visit(decorator)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            self.visit(node.args)
            if node.returns:
                self.visit(node.returns)
        else:
            for expression in [*node.bases, *node.keywords]:
                self.visit(expression)
        for parameter in node.type_params:
            self.visit(parameter)
        previous = self.scope
        self.scope = identifier
        for statement in node.body:
            self.visit(statement)
        self.scope = previous

    def visit_FunctionDef(self, node):
        self.definition(node, "python-function")

    def visit_AsyncFunctionDef(self, node):
        self.definition(node, "python-async-function")

    def visit_ClassDef(self, node):
        self.definition(node, "python-class")

    def visit_Call(self, node):
        label = ast.unparse(node.func)
        identifier = self.capture(node, "python-call", label[:512])
        target = reference("python-callable", label)
        links.append({"source": identifier, "target": target, "relation": "references-callee", "confidence": "EXTRACTED", "confidence_score": 1,
                      "resolution": "UNRESOLVED", "source_file": self.path, "source_location": f"L{node.lineno}"})
        coverage["calls"] += 1
        self.generic_visit(node)

    def imports(self, node, labels):
        identifier = self.capture(node, "python-import", ", ".join(labels))
        for label in labels:
            target = reference("python-module", label)
            links.append({"source": identifier, "target": target, "relation": "imports", "confidence": "EXTRACTED", "confidence_score": 1,
                          "resolution": "UNRESOLVED", "source_file": self.path, "source_location": f"L{node.lineno}"})
            candidates = modules.get(label, [])
            if len(candidates) == 1:
                links.append({"source": target, "target": candidates[0], "relation": "module-path-candidate", "confidence": "INFERRED", "confidence_score": 0.5,
                              "resolution": "static path; import hooks and runtime sys.path are not evaluated"})
        coverage["imports"] += 1

    def visit_Import(self, node):
        self.imports(node, [alias.name for alias in node.names])

    def visit_ImportFrom(self, node):
        module = "." * node.level + (node.module or "")
        self.imports(node, [module + ":" + alias.name for alias in node.names])

for path in paths:
    data = (root / path).read_bytes()
    file_node = {"id": "file:" + path, "label": path, "kind": "python-source", "source_file": path, "language": "python",
                 "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "provenance": "EXTRACTED"}
    nodes.append(file_node)
    try:
        tree = ast.parse(data, filename=path, type_comments=True)
    except (SyntaxError, UnicodeError, ValueError) as error:
        file_node["parsed"] = False
        coverage["syntaxErrors"].append({"file": path, "error": str(error), "line": getattr(error, "lineno", None)})
        continue
    file_node["parsed"] = True
    coverage["parsed"] += 1
    coverage["astNodes"] += sum(1 for node in ast.walk(tree))
    GraphVisitor(path).visit(tree)

print(json.dumps({"producer": "CPython ast via native UV", "directed": True, "multigraph": True,
                  "graph": {"coverage": coverage, "python": sys.version, "executable": sys.executable,
                            "extraction": "all tracked Python files, declarations, calls and imports; dynamic call targets remain unresolved"},
                  "nodes": nodes, "links": links}, ensure_ascii=True, separators=(",", ":")))
`;
