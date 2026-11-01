'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../src/engine');
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);

test('clearing: fully funded payments',()=>{const r=E.clearPayments([10,0],[[0,8],[0,0]]);near(r.pay[0],8);near(r.balances[0],2);near(r.balances[1],8);});
test('clearing: analytic two-step contagion',()=>{const r=E.clearPayments([2,3,0],[[0,10,0],[0,0,9],[0,0,0]]);near(r.pay[0],2);near(r.pay[1],5);near(r.balances[2],5);assert.ok(r.residual<1e-9);});
test('clearing: pro rata and no overpayment',()=>{const r=E.clearPayments([6,0,0],[[0,8,4],[0,0,0],[0,0,0]]);near(r.flows[0][1],4);near(r.flows[0][2],2);});
test('clearing: greatest fixed point in an unanchored cycle',()=>{const r=E.clearPayments([0,0],[[0,10],[10,0]]);near(r.pay[0],10);near(r.pay[1],10);});
test('clearing: a cycle with external leakage cannot create cash',()=>{const r=E.clearPayments([0,0,0],[[0,9,1],[9,0,1],[0,0,0]]);assert.ok(r.pay[0]<1e-8);near(r.balances.reduce((a,b)=>a+b,0),0);});
test('clearing: invalid inputs fail loudly',()=>{assert.throws(()=>E.clearPayments([-1,0],[[0,1],[0,0]]));assert.throws(()=>E.clearPayments([1],[[NaN]]));assert.throws(()=>E.clearPayments([1],[[0,1]]));});
test('setup: all internal funded claims mirror liabilities',()=>{const w=E.createWorld();assert.equal(E.auditWorld(w).ok,true);assert.equal(w.nodes.length,13);assert.equal(w.loans.length,24);});
test('commitments: future service payments are not funded debt',()=>{const w=E.createWorld();const debt=E.liabilities(w,'labA');w.contracts[0].quarterly*=10;near(E.liabilities(w,'labA'),debt);});
test('regulation: new LTV ceiling does not rewrite existing loans',()=>{const a=E.createWorld({policy:{ltv:.3}}),b=E.createWorld({policy:{ltv:.9}});assert.deepEqual(a.loans,b.loans);});
test('determinism: same seed produces the same full path',()=>{assert.deepEqual(E.exportRun(E.run({seed:42})),E.exportRun(E.run({seed:42})));});
test('policy comparisons use the same exogenous innovations',()=>{const a=E.run({policy:E.PRESETS.market.policy}),b=E.run({policy:E.PRESETS.preventive.policy});assert.deepEqual(a.shocks,b.shocks);});
test('null shock: zero-severity disappointment equals baseline',()=>{assert.deepEqual(E.run({scenario:'baseline',severity:0}).history,E.run({scenario:'disappointment',severity:0}).history);});
test('baseline: no forced financial catastrophe in the seed example',()=>{const w=E.run({scenario:'baseline'});assert.equal(E.summarize(w).defaults,0);});
test('technical success can coexist with failed companies',()=>{const r=E.summarize(E.run({scenario:'competition'}));assert.ok(r.technology>1.5);assert.ok(r.defaults>0);});
test('stagnation is not hard-coded as financial collapse',()=>{const w=E.run({scenario:'stagnation'});assert.equal(E.summarize(w).bankDefaults,0);near(w.history[8].technology,w.history[16].technology);});
test('guarantee: capped cash transfer, no new original debt, no duplicate recovery',()=>{const w=E.createWorld();const before=E.liabilities(w,'cloud'),cash=w.nodes.find(n=>n.id==='chip').cash;const losses=[{loanId:'L5',borrower:'cloud',lender:'bankA',loss:40,remaining:40}];const g=E.settleGuarantees(w,losses);near(g.paidTotal,18);near(losses[0].remaining,22);near(w.nodes.find(n=>n.id==='chip').cash,cash-18);near(E.liabilities(w,'cloud'),before);near(E.settleGuarantees(w,losses).paidTotal,0);assert.equal(E.auditWorld(w).ok,true);});
test('fiscal: injections respect budget and create equity claims',()=>{const w=E.run({severity:1.5,bankBuffer:.04,policy:E.PRESETS.stabilization.policy});assert.ok(w.recapSpent>0);assert.ok(w.recapSpent<=80+1e-8);assert.ok(w.workerSpent<=48+1e-8);assert.ok(w.equityHoldings.some(h=>h.holder==='gov'));assert.ok(w.audit.every(a=>a.ok));});
test('liquidity: lending remains a repayable balance-sheet claim',()=>{const w=E.run({severity:1.5,bankBuffer:.04,policy:E.PRESETS.liquidity.policy});assert.ok(w.liquidityDrawn>0);assert.ok(w.loans.some(l=>l.type==='liquidity'));assert.equal(w.recapSpent,0);assert.ok(w.ledger.some(x=>x.reason==='new_loan'&&x.from==='fed'));});
test('private bank equity is paid for by an identified investor',()=>{const w=E.run({quarters:2,policy:E.PRESETS.preventive.policy});assert.ok(w.ledger.some(x=>x.reason==='equity_issuance'&&['bankA','bankB'].includes(x.to)&&['domestic','foreign'].includes(x.from)));});
test('quarterly default principal is not written off twice',()=>{const w=E.run({quarters:20,severity:1.5});const totals=w.history.map(h=>h.cumulativeGrossCreditLoss);for(let i=1;i<totals.length;i++)assert.ok(totals[i]>=totals[i-1]-1e-8);for(const n of w.nodes.filter(n=>n.closed))assert.ok(!w.loans.some(l=>l.borrower===n.id));});
test('saved policy intervention replay is exact',()=>{const w=E.createWorld({severity:1.3,bankBuffer:.07});for(let q=0;q<16;q++){if(q===5)E.setPolicy(w,E.PRESETS.stabilization.policy);E.step(w);}const saved=JSON.parse(JSON.stringify(E.exportRun(w))),back=E.replay(saved);assert.deepEqual(E.summarize(back),E.summarize(w));assert.deepEqual(back.history,w.history);});
test('bad policies, saves and inputs are rejected',()=>{assert.throws(()=>E.createWorld({severity:3}));assert.throws(()=>E.createWorld({seed:NaN}));assert.throws(()=>E.createWorld({bankBuffer:.001}));assert.throws(()=>E.run({quarters:4001}));assert.throws(()=>E.validatePolicy({capitalTarget:-1}));assert.throws(()=>E.replay({schema:'bad'}));});
test('stress grid reports finite coverage, not probability or global proof',()=>{const r=E.stressGrid({quarters:8});assert.equal(r.results.length,16);assert.match(r.warning,/not a proof/);});
test('fuzz: cash, debts, bounds and solver residuals across scenario-policy combinations',()=>{
  let count=0;
  for(const sc of Object.keys(E.SCENARIOS))for(const severity of [0,.8,1.5,2])for(const [id,p] of Object.entries(E.PRESETS))for(const seed of [2,37]){
    const w=E.run({scenario:sc,severity,policy:p.policy,seed,quarters:20,bankBuffer:seed===2?.04:.105,params:{fireSaleElasticity:seed===2?1.1:.4,creditFeedback:.9}});
    const r=E.summarize(w);assert.ok(w.audit.every(a=>a.ok));assert.ok(r.maxCashError<1e-6);assert.ok(r.maxClearingResidual<1e-8);assert.ok(r.netCreditLoss>=-1e-6);assert.ok(w.guarantees.every(g=>g.remaining>=-1e-8));count++;
  }
  assert.equal(count,288);
});

test('individual cash ledgers reconcile and fiscal taxes have identified payers',()=>{
  const w=E.run({severity:1.5,bankBuffer:.04,policy:E.PRESETS.stabilization.policy});
  assert.ok(w.ledger.some(e=>e.category==='tax'&&e.to==='gov'&&e.amount>0));
  for(const n of w.nodes){let balance=w.initialNodeCash[n.id];for(const e of w.ledger)if(Number.isFinite(e.amount)){if(e.from===n.id)balance-=e.amount;if(e.to===n.id)balance+=e.amount;}near(balance,n.cash);}
  assert.ok(w.audit.every(a=>a.maxNodeCashError<1e-6));
});
