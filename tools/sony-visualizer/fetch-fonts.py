"""Stage AOSP fonts for the same Android Skia backend used by the native port."""
from pathlib import Path
import urllib.request,base64,shutil,os,hashlib
root=Path(os.environ.get('SONY_VISUALIZER_ROOT',Path(__file__).resolve().parents[1]))
data=root/'build/web/data'
for name in ['fonts','etc']:
 shutil.copytree(root/'upstream/reference-data'/name,data/name,dirs_exist_ok=True)
for name in ['DroidSans.ttf','DroidSans-Bold.ttf']:
 path=data/'fonts'/name
 if not path.exists():
  url='https://android.googlesource.com/platform/frameworks/base/+/android-2.3.7_r1/data/fonts/'+name+'?format=TEXT'
  value=base64.b64decode(urllib.request.urlopen(url,timeout=60).read())
  assert value[:4]==b'\x00\x01\x00\x00'
  path.write_bytes(value)
 print(name,hashlib.sha256(path.read_bytes()).hexdigest())
