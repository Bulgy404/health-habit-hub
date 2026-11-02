"""Stage a reviewable store-asset package and checksum every deliverable."""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile

ROOT=Path(__file__).resolve().parent
OUT=ROOT/'review-pack'

def copy(source,target):
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(source,target)

def folder(source,target,extensions=None,exclude=()):
    for item in source.rglob('*'):
        rel=item.relative_to(source)
        if item.is_file() and not any(part in exclude for part in rel.parts) and (extensions is None or item.suffix in extensions):
            copy(item,target/rel)

def main():
    # This generated staging folder is owned by this build helper.
    if OUT.exists():shutil.rmtree(OUT)
    OUT.mkdir()
    folder(ROOT/'brand-package',OUT/'01_brand',{'.png','.svg','.md','.py'})
    for ext in ['png','svg']:
        copy(ROOT.parent/'app-store-header/v4'/('health-habit-hub-banner-green.'+ext),OUT/'01_brand'/('health-habit-hub-approved-header-v4.'+ext))
    motion=ROOT/'header-loop-v3'
    for name in ['health-habit-hub-growing-graph-8s-v3.mp4','growing-graph-complete.svg','growing-graph-complete.png','README.md','validation.json','build_growing_graph.py']:
        copy(motion/name,OUT/'02_header_motion'/name)
    originals=OUT/'03_ios_originals'
    folder(ROOT/'capture/raw',originals/'raw',{'.png'})
    for name in ['README.md','capture-manifest.json','simulator-devices.json']:
        copy(ROOT/'capture'/name,originals/name)
    for name in ['duo-device.json','duo-displays.txt']:
        if (ROOT/'capture'/name).exists():copy(ROOT/'capture'/name,originals/name)
    folder(ROOT/'capture/source',originals/'source',{'.py','.dart'})
    folder(ROOT/'mockups-current',OUT/'04_ios_mockups',{'.png','.svg','.jpg','.json','.md','.py'})
    # Adjust source paths to match the packaged originals directory.
    for file in (OUT/'04_ios_mockups').rglob('*.md'):
        file.write_text(file.read_text().replace('../capture/raw','../03_ios_originals/raw').replace('../capture/README.md','../03_ios_originals/README.md'))
    previews=OUT/'05_ios_previews'
    for item in (ROOT/'capture/recordings').glob('*.mp4'):copy(item,previews/item.name)
    for item in (ROOT/'capture/recordings').glob('*.mov'):copy(item,previews/'native'/item.name)
    for name in ['preview-validation.json','app-preview-en-contact-sheet.png']:
        if (ROOT/'capture/recordings'/name).exists():copy(ROOT/'capture/recordings'/name,previews/name)
    (previews/'README.md').write_text('English/German 25-second recordings of the actual app, exported at 886 × 1920, H.264, 30fps, 750 frames, silent. Fictional local examples. Native source recordings are included. See ../03_ios_originals/README.md for provenance and current-app review notes.\n')
    folder(ROOT/'play-concepts',OUT/'06_google_play_concepts',{'.png','.svg','.mp4','.md','.json','.py'})
    copy(ROOT/'PACK-README.md',OUT/'README.md')
    copy(ROOT/'ASSET-PLAN.md',OUT/'ASSET-PLAN.md')
    # Production paths in the plan are preserved; the README maps package folders.
    files=[]
    for file in sorted(OUT.rglob('*')):
        if file.is_file():files.append({'path':str(file.relative_to(OUT)),'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
    (OUT/'file-manifest.json').write_text(json.dumps({'date':'2026-11-02','files':files},indent=2))
    archive=ROOT/'Health-Habit-Hub-Store-Assets-2026-11-02.zip'
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for file in sorted(OUT.rglob('*')):
            if file.is_file():z.write(file,Path('Health-Habit-Hub-Store-Assets-2026-11-02')/file.relative_to(OUT))
    with zipfile.ZipFile(archive) as z:assert z.testzip() is None
    print(json.dumps({'files':len(files),'zip':str(archive),'bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest()},indent=2))

if __name__=='__main__':main()
