import re, sys, os
root = sys.argv[1]
html = open(os.path.join(root,'index.html'), encoding='utf-8').read()
js = open(os.path.join(root,'assets/app.js'), encoding='utf-8').read()

fails = []
if 'onclick=' in html: fails.append("inline onclick left in html")
if 'onclick=' in js: fails.append("inline onclick left in js")

# every action named in markup or in generated html must be in the table
named = set(re.findall(r'data-action="([A-Za-z_$][\w$]*)"', html + js))
block_start = js.find("registerActions({")
block = js[block_start: js.find("\n});", block_start)]
wired = set(re.findall(r'^\s{2}([A-Za-z_$][\w$]*):', block, re.M))
missing = sorted(named - wired)
if missing: fails.append("actions with no handler: " + ", ".join(missing))

# and every wired action must name a function that exists
defined = set(re.findall(r'^(?:async )?function ([A-Za-z_$][\w$]*)', js, re.M))
extra = sorted(a for a in wired if a not in defined and a not in
               {"pickFile","toggleOpen","padShift","wipe","openPad","toggleTrainingSource",
                "removeAlertTo","pickOption","revealExample","startSolo","openTrack","startChapter",
                "retryReading","dismissNote","deletePaper","openChapter","padKey"})
INLINE = {"dismissJobBanner", "dismissScanBanner", "saveBalance", "saveLimits", "wipeHistory", "wipeQuestions", "walletRefilled", "skipProvisional", "fixAmbiguous", "dropAmbiguous", "noteDifficulty", "skipChapter", "keepOutOfTurn", "uploadStaged", "openTab", "toggleFileStatus", "startQuestion", "backToTopics"}   # defined inside registerActions itself
extra = [x for x in extra if x not in INLINE]
if extra: fails.append("wired but not defined: " + ", ".join(extra))

print(f"{len(named)} actions named, {len(wired)} wired")
print("FAILURES:" if fails else "ALL CHECKS PASS")
for f in fails: print("  -", f)
