"""Copy the completed review pack into the user-authorized OneDrive assets folder."""
from pathlib import Path
import hashlib
import json
import shutil

ROOT=Path(__file__).resolve().parent
DEST=Path('/Users/felixreinsch/Library/CloudStorage/OneDrive-Personal/01_Arbeit/ResearchGroupDigitalHealth/Projekte/Health Habit Hub/Promo_Material/04_Quelldateien/assets')
PACK=ROOT/'review-pack'
TARGET=DEST/'store-pack-2026-11-02'

def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    manifest=json.loads((PACK/'file-manifest.json').read_text())
    for file in manifest['files']:assert digest(PACK/file['path'])==file['sha256']
    count=0
    for source in sorted(PACK.rglob('*')):
        if source.is_file():
            target=TARGET/source.relative_to(PACK)
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(source,target)
            assert digest(source)==digest(target),str(target)
            count+=1
    archive=ROOT/'Health-Habit-Hub-Store-Assets-2026-11-02.zip'
    shutil.copy2(archive,DEST/archive.name)
    assert digest(archive)==digest(DEST/archive.name)
    # Keep the original asset-plan entry point current as well.
    shutil.copy2(ROOT/'ASSET-PLAN.md',DEST/'ASSET-PLAN-2026-11-02.md')
    latest=DEST/'app-store/headers/motion-proof/v3'
    latest.mkdir(parents=True,exist_ok=True)
    for name in ['growing-graph-complete.png','growing-graph-complete.svg']:
        source=ROOT/'header-loop-v3'/name
        shutil.copy2(source,latest/name)
        assert digest(source)==digest(latest/name)
    result={'folder':str(TARGET),'zip':str(DEST/archive.name),'verified_files':count,'archive_sha256':digest(archive),'date':'2026-11-02'}
    (ROOT/'onedrive-sync-validation.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result,indent=2))

if __name__=='__main__':main()
