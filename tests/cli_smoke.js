#!/usr/bin/env node
'use strict';
// Exercise actual CLI commands; temporary generated runs are removed afterwards.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ai-finance-cli-'));
const load=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function cli(args){const r=spawnSync(process.execPath,[path.join(ROOT,'src/cli.js'),...args],{cwd:ROOT,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||r.stdout||'CLI failed');}
try {
 cli(['demo','--out',tmp]);
 cli(['run','--config','examples/config.json','--out',path.join(tmp,'configured.json')]);
 const demo=load(path.join(tmp,'demo_intervention.json')),configured=load(path.join(tmp,'configured.json'));
 assert.deepEqual(demo.summary,configured.summary);
 const browserPath=process.argv[2]||path.join(ROOT,'test-results/v0.3.0/browser-finance-demo.json');
 const hasBrowser=fs.existsSync(browserPath);if(hasBrowser){const browser=load(browserPath);assert.deepEqual(browser.summary,demo.summary);}
 const E=require('../src/engine');assert.deepEqual(E.summarize(E.replay(demo)),demo.summary);
 cli(['step','--input',path.join(tmp,'demo_intervention.json'),'--quarters','1','--policy-file','examples/policy.json','--out',path.join(tmp,'continued.json')]);
 const stepped=load(path.join(tmp,'continued.json'));assert.equal(stepped.quarter,17);assert.equal(stepped.policyLog.at(-1).policy.ltv,.55);
 const report={checks:hasBrowser?5:4,passed:hasBrowser?5:4,failed:0,skipped:hasBrowser?[]:['Browser/CLI comparison: run tests/browser-v030.cjs first or pass its browser-finance-demo.json'],details:['CLI config schedule equals interactive intervention',...(hasBrowser?['browser demo equals CLI demo']:[]),'engine JSON replay equals source result','step advances to Q17','step applies requested LTV policy']};
 fs.mkdirSync(path.join(ROOT,'test-results/v0.3.0'),{recursive:true});
 fs.writeFileSync(path.join(ROOT,'test-results/v0.3.0/cli-tests.json'),JSON.stringify(report,null,2)+'\n');console.log(report);
} finally {fs.rmSync(tmp,{recursive:true,force:true});}
