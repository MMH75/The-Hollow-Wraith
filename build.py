"""Bundles src/ into a single self-contained index.html.

Browsers refuse to load separate script modules from a page opened straight from disk (file://),
so the game is shipped as one file. Edit the files in src/, then run:  python build.py
"""
import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / 'src'
ORDER = ['textures', 'audio', 'house', 'entity', 'keys', 'main']  # dependencies first

external = []   # imports from 'three' / CDN, hoisted to the top
chunks = []
for name in ORDER:
    code = (SRC / f'{name}.js').read_text(encoding='utf-8')
    exports = re.findall(r'^export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)', code, re.M)

    def local_import(m):
        what, mod = m.group(1).strip(), Path(m.group(2)).stem
        if what.startswith('* as '):
            return f'const {what[5:].strip()} = __{mod};'
        return f'const {what} = __{mod};'

    def any_import(m):
        line = m.group(0)
        if re.search(r"from\s+'\./", line):
            return re.sub(r"import\s+(.+?)\s+from\s+'(\./[^']+)';", local_import, line)
        if line not in external:
            external.append(line)
        return ''

    code = re.sub(r"^import\s+.+?\s+from\s+'[^']+';", any_import, code, flags=re.M)
    code = re.sub(r'^export\s+', '', code, flags=re.M)
    chunks.append(f'// ===== src/{name}.js =====\nconst __{name} = (() => {{\n{code}\nreturn {{ {", ".join(exports)} }};\n}})();\n')

script = '<script type="module">\n' + '\n'.join(external) + '\n\n' + '\n'.join(chunks) + '</script>'
# the menu background is embedded too, so index.html stays a single file
menu_bg = 'data:image/webp;base64,' + base64.b64encode((ROOT / 'images' / 'menu_background.webp').read_bytes()).decode()
style = '<style>\n' + (SRC / 'style.css').read_text(encoding='utf-8').replace('MENU_BACKGROUND', menu_bg) + '</style>'
html = (SRC / 'index.template.html').read_text(encoding='utf-8')
# Sound files are embedded as base64 so the game still works when index.html is opened from disk.
b64 = lambda p: base64.b64encode(p.read_bytes()).decode()
sounds = {
    'doors': [b64(p) for p in sorted((ROOT / 'sounds' / 'doors').glob('*.mp3'))],
    'music': b64(ROOT / 'sounds' / 'music' / 'gameplay_background.mp3'),
    'presence': b64(ROOT / 'sounds' / 'wraith' / 'presence.mp3'),
    'seen': b64(ROOT / 'sounds' / 'wraith' / 'seen.mp3'),
    'catch': b64(ROOT / 'sounds' / 'wraith' / 'catch.mp3'),
}
sound_script = '<script>window.HOTEL_SOUNDS = ' + json.dumps(sounds) + ';</script>\n'
html = html.replace('<!-- GAME_STYLE -->', style).replace('<!-- GAME_SCRIPT -->', sound_script + script)
(ROOT / 'index.html').write_text(html, encoding='utf-8')
print(f'Built index.html ({len(html) // 1024} KB)')
