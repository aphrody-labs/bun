import json
import sys

from package.answer import answer

print(json.dumps({
    "answer": answer(),
    "argv": sys.argv[1:],
    "name": __name__,
    "file": __file__,
}, ensure_ascii=False))
