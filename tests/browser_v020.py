from playwright.sync_api import sync_playwright
from pathlib import Path
import json, time, re, sys
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'results/v0.2.0'; OUT.mkdir(parents=True,exist_ok=True)
url=sys.argv[1] if len(sys.argv)>1 else 'inline:test-build'
def load(page):
 if url.startswith('inline:'):page.set_content((ROOT/'index.html').read_text(),wait_until='load')
 else:page.goto(url)
checks=[];errors=[]
def check(label,condition,**data):
 checks.append(dict(name=label,passed=bool(condition),**data));assert condition,label
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1512,'height':1400},device_scale_factor=1)
 page.on('pageerror',lambda e:errors.append(str(e)))
 load(page);page.wait_for_function("window.__sandbox && window.__sandbox.uiVersion==='0.2.0'")
 check('startup at Q0',page.evaluate('window.__sandbox.world.quarter')==0)
 check('five character cards',page.locator('.character-card').count()==5)
 loaded=page.evaluate("""async()=>{let i=new Image();i.src=window.AIFinanceArt.dataUri;await i.decode();return {w:i.naturalWidth,h:i.naturalHeight};}""")
 check('embedded WebP atlas decodes',loaded['w']==800 and loaded['h']==720)
 for mood in ['calm','happy','worried','defeated']:
  page.select_option('#moodPreview',mood)
  check('all five '+mood+' expressions selectable',page.locator('[data-mood="'+mood+'"]').count()==5)
 page.locator('#characterSection').screenshot(path=str(OUT/'expressions-defeated.png'))
 page.select_option('#moodPreview','auto')
 page.click('#stepBtn');check('next quarter',page.evaluate('window.__sandbox.world.quarter')==1)
 page.select_option('#playSpeed','350');page.click('#playBtn');page.wait_for_timeout(820);page.click('#playBtn')
 q=page.evaluate('window.__sandbox.world.quarter');page.wait_for_timeout(500)
 check('autoplay advances then pauses',q>=3 and page.evaluate('window.__sandbox.world.quarter')==q)
 page.click('#branchBtn');page.click('#stepBtn');page.click('#restoreBtn');check('saved branch restores quarter',page.evaluate('window.__sandbox.world.quarter')==q)
 page.click('#demoBtn')
 with page.expect_download() as dd:
  page.click('#exportBtn')
 dd.value.save_as(str(OUT/'browser-finance-demo.json'))
 page.click('#laborDemoBtn');page.wait_for_timeout(400)
 h=page.evaluate('window.__sandbox.world.history.at(-1)')
 check('extreme demo population metrics not capped at 30',h['unemployment']>30 and h['nonEmploymentRate']>65)
 check('UI sliders exactly preserve 12% exits and 22% transition',page.evaluate('window.__sandbox.world.labor.config.exitRate===.12 && window.__sandbox.world.labor.config.transitionSpeed===.22'))
 check('browser and CLI strong scenario match',abs(h['employmentRate']-13.921147790215633)<1e-8)
 check('people sum to 100',abs(h['employed']+h['unemployedPersons']+h['notInLaborForce']-100)<1e-8)
 check('auto expressions are state-dependent',len(set(page.locator('.character-card').evaluate_all('(els)=>els.map(e=>e.dataset.mood)')))>1)
 # Top-of-page game overview shows actual portraits alongside actual simulated data.
 page.evaluate("document.getElementById('toast').style.display='none';window.scrollTo(0,0)");page.wait_for_timeout(300);page.screenshot(path=str(OUT/'game-overview.png'))
 page.locator('#laborSection').screenshot(path=str(OUT/'employment-strong.png'))
 page.click('#exitDemoBtn');page.wait_for_timeout(400);page.evaluate("document.getElementById('toast').style.display='none'")
 ex=page.evaluate('window.__sandbox.world.history.at(-1)')
 check('exiting search does not erase nonemployment',ex['unemployment']<10 and ex['nonEmploymentRate']>70)
 page.locator('#laborSection').screenshot(path=str(OUT/'employment-exit.png'))
 page.click('#compareBtn');check('policy comparison includes population metrics','最低就业人口比' in page.locator('#comparisonResult').inner_text())
 page.click('#exportBtn')
 # File download + import round-trip, including labor config.
 with page.expect_download() as download:
  page.click('#exportBtn')
 save=OUT/'browser-export.json';download.value.save_as(str(save))
 previous=page.evaluate('window.__sandbox.world.history.at(-1).employmentRate')
 page.click('#resetBtn');page.locator('#fileInput').set_input_files(str(save))
 page.wait_for_function('window.__sandbox.world.quarter===24')
 check('browser import preserves labor config/results',abs(page.evaluate('window.__sandbox.world.history.at(-1).employmentRate')-previous)<1e-9)
 with page.expect_download() as d:
  page.click('#csvBtn')
 csv=OUT/'browser-export.csv';d.value.save_as(str(csv))
 check('CSV contains people and hours',all(k in csv.read_text().splitlines()[0] for k in ['employmentRate','participationRate','humanWorkIndex','workingAgePopulation']))
 mobile=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
 mp=mobile.new_page();mp.on('pageerror',lambda e:errors.append(str(e)))
 load(mp);mp.wait_for_function('window.__sandbox && window.__sandbox.world.quarter===0')
 mp.tap('#stepBtn');check('mobile touch advances',mp.evaluate('window.__sandbox.world.quarter')==1)
 mp.tap('#playBtn');mp.wait_for_timeout(1100);mp.tap('#playBtn');q=mp.evaluate('window.__sandbox.world.quarter');mp.wait_for_timeout(1000)
 check('mobile autoplay pauses',q>=2 and mp.evaluate('window.__sandbox.world.quarter')==q)
 check('mobile no page horizontal overflow',mp.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'))
 check('mobile roster has horizontal swipe region',mp.locator('#castGrid').evaluate('(e)=>e.scrollWidth>e.clientWidth'))
 mp.tap('#laborDemoBtn');mp.wait_for_timeout(500);mp.evaluate('window.scrollTo(0,0)');mp.wait_for_timeout(400);mp.screenshot(path=str(OUT/'game-mobile.png'),full_page=True)
 check('no Javascript errors',not errors)
 browser.close()
report={'url':url,'environment':'Linux Chromium; desktop and touch-mobile emulation, not a physical phone','passed':sum(x['passed'] for x in checks),'failed':sum(not x['passed'] for x in checks),'checks':checks,'errors':errors}
(OUT/'browser-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2))
