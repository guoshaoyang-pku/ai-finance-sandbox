/* AI Finance Sandbox v0.1 — educational model, not a forecast.
 * Units: USD billions, quarters, decimal annual interest rates.
 * No dependencies. Same engine is used by browser, CLI and tests.
 */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.AIFinance = api;
  else if (root) root.AIFinance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const VERSION='0.2.0', EPS=1e-8;
  const Labor=typeof module==='object'&&module.exports?require('./labor'):globalThis.AILabor;
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const sum=a=>a.reduce((s,x)=>s+x,0);
  const clone=x=>JSON.parse(JSON.stringify(x));
  function rng(seed) { let a=seed>>>0; return ()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}; }
  function assertFinite(x,label) {if(!Number.isFinite(x))throw Error('Non-finite '+label);return x;}

  // Greatest Eisenberg–Noe clearing vector. L[i][j] means i owes j.
  // Outside claims are represented by an explicit zero-liability sink node.
  function clearPayments(cash,L,tol=1e-10,maxIter=10000) {
    const n=cash.length;
    if(!n || L.length!==n || L.some(r=>r.length!==n))throw Error('Invalid clearing dimensions');
    if(cash.some(v=>!Number.isFinite(v)||v<0)||L.some(r=>r.some(v=>!Number.isFinite(v)||v<0)))throw Error('Negative/non-finite clearing input');
    const due=L.map(sum), P=L.map((r,i)=>r.map(v=>due[i]>0?v/due[i]:0));
    let pay=due.slice(), iter=0,err=Infinity;
    while(iter++<maxIter) {
      const incoming=Array(n).fill(0);
      for(let i=0;i<n;i++)for(let j=0;j<n;j++)incoming[j]+=P[i][j]*pay[i];
      const next=due.map((v,i)=>Math.min(v,cash[i]+incoming[i]));
      err=Math.max(...next.map((v,i)=>Math.abs(v-pay[i])));pay=next;
      if(err<tol)break;
    }
    if(err>=tol)throw Error('Clearing did not converge');
    const flows=L.map((r,i)=>r.map(v=>due[i]>0?v*pay[i]/due[i]:0));
    const incoming=Array(n).fill(0);for(let i=0;i<n;i++)for(let j=0;j<n;j++)incoming[j]+=flows[i][j];
    const balances=cash.map((v,i)=>v+incoming[i]-pay[i]);
    const residual=Math.max(...pay.map((v,i)=>Math.abs(v-Math.min(due[i],cash[i]+incoming[i]))));
    return {pay,due,flows,incoming,balances,iterations:iter,residual,ratios:due.map((v,i)=>v>0?pay[i]/v:1)};
  }

  const SCENARIOS={
    baseline:{label:'温和发展',description:'需求与能力逐步提高，无额外危机冲击。'},
    stagnation:{label:'能力停滞，应用继续扩散',description:'第4季起前沿能力增速归零或接近零；现有技术仍可继续应用。'},
    disappointment:{label:'商业化不及预期',description:'第4季起需求、再融资意愿和GPU残值同时下降。'},
    competition:{label:'技术成功，利润被竞争压低',description:'能力进步更快，但价格下降，第二家模型公司失去份额。'},
    displacement:{label:'技术成功，就业调整滞后',description:'AI需求增长，同时传统行业收入与就业受到冲击。'},
    rates:{label:'通胀与融资成本冲击',description:'利率与期限溢价上升；不能假定危机中美债一定上涨。'}
  };
  const DEFAULT_POLICY={capexPace:1,ltv:0.80,capitalTarget:0.10,concentration:2.5,guaranteeLimit:1,
    liquidityLine:0,recapBudget:0,workerSupport:0,approvalLag:1,bufferRelease:0,taxRate:0.10};
  const PRESETS={
    market:{label:'原有规则',policy:{...DEFAULT_POLICY}},
    preventive:{label:'提前降低融资风险',policy:{...DEFAULT_POLICY,capexPace:.8,ltv:.55,capitalTarget:.15,concentration:1.2,guaranteeLimit:.6}},
    liquidity:{label:'只提供流动性',policy:{...DEFAULT_POLICY,liquidityLine:80}},
    stabilization:{label:'流动性＋注资＋就业支持',policy:{...DEFAULT_POLICY,liquidityLine:80,recapBudget:80,workerSupport:3,bufferRelease:.025}},
    slow:{label:'只放慢资本开支',policy:{...DEFAULT_POLICY,capexPace:.5}},
    late:{label:'危机中突然收紧',policy:{...DEFAULT_POLICY,capitalTarget:.18,ltv:.4,concentration:.8}}
  };
  function validatePolicy(p) {
    const ranges={capexPace:[.2,1.4],ltv:[.2,.95],capitalTarget:[.04,.25],concentration:[.3,4],guaranteeLimit:[0,1],liquidityLine:[0,200],recapBudget:[0,200],workerSupport:[0,8],approvalLag:[0,4],bufferRelease:[0,.06],taxRate:[0,.3]};
    const out={...DEFAULT_POLICY,...p};
    for(const [k,[a,b]] of Object.entries(ranges))if(!Number.isFinite(out[k])||out[k]<a||out[k]>b)throw Error(`Policy ${k} must be in [${a},${b}]`);
    out.approvalLag=Math.round(out.approvalLag);return out;
  }
  function makeNode(id,name,kind,cash,gpu,other,treasury,rev,cost,capex) {
    return {id,name,kind,cash,gpu,other,treasury,baseOther:other,baseRevenue:rev,baseCost:cost,baseCapex:capex,
      closed:false,defaultQuarter:null,defaultReason:null,grossCreditLoss:0,guaranteeRecovery:0,guaranteePaid:0,
      cumulativeCapex:0,lastRevenue:rev,lastProfit:0,lastCapex:0,shares:100,marketCap:0,baseMarketCap:0,dividends:0};
  }
  function createWorld(opts={}) {
    const scenario=opts.scenario||'disappointment';if(!SCENARIOS[scenario])throw Error('Unknown scenario');
    const severity=opts.severity===undefined?1:Number(opts.severity);if(!(severity>=0&&severity<=2))throw Error('Severity outside [0,2]');
    if(opts.seed!==undefined&&(!Number.isInteger(opts.seed)||opts.seed<0||opts.seed>4294967295))throw Error('Invalid seed');
    const random=rng(opts.seed===undefined?42:opts.seed);
    const nodes=[
      makeNode('labA','模型公司 A','lab',48,6,24,0,19,8,1),
      makeNode('labB','模型公司 B','lab',34,4,17,0,14,6,1),
      makeNode('cloud','算力运营商','cloud',24,150,12,0,9,10,18),
      makeNode('chip','芯片供应商','chip',75,0,155,15,25,15,0),
      makeNode('hyper','综合科技集团','hyper',115,165,280,30,94,49,33),
      makeNode('legacy','传统行业企业','legacy',48,0,190,10,45,29,2),
      makeNode('bankA','银行 A','bank',52,0,325,95,3,4,0),
      makeNode('bankB','银行 B','bank',47,0,255,85,2.5,3.5,0),
      makeNode('credit','私募信贷基金','credit',32,0,35,12,2,1.2,0),
      makeNode('domestic','美国长期投资者','investor',800,0,0,550,4,1,0),
      makeNode('foreign','海外投资者','foreign',650,0,0,450,3,1,0),
      makeNode('gov','财政部门','government',5,0,0,0,0,0,0),
      makeNode('fed','美联储工具账户','centralbank',200,0,0,0,0,0,0)
    ];
    const w={version:VERSION,seed:opts.seed===undefined?42:opts.seed,scenario,severity,quarter:0,nodes,loans:[],contracts:[],guarantees:[],equityHoldings:[],policy:validatePolicy(opts.policy||{}),policyLog:[],history:[],events:[],audit:[],
      shocks:Array.from({length:49},()=>Array.from({length:6},()=>random()*2-1)),
      params:{fireSaleElasticity:.7,creditFeedback:.7,adoptionElasticity:1,rateDuration:5,...opts.params},
      macro:{gdp:100,unemployment:4.5,inflation:2.5,policyRate:4.0,treasuryYield:4.3,spread:1.8,dollar:100,sp500:100,nasdaq:100,creditSupply:1,politicalSupport:60},
      ai:{technology:1,adoption:1,gpuPrice:1,computePrice:1,capacity:325,confidence:1},
      initialCash:sum(nodes.map(n=>n.cash)),initialNodeCash:Object.fromEntries(nodes.map(n=>[n.id,n.cash])),externalCashNet:0,cumulativeCreditLoss:0,cumulativeGrossCreditLoss:0,
      recapSpent:0,workerSpent:0,fiscalDebt:0,govEquityCost:0,govEquityValue:0,liquidityDrawn:0,liquidityLoss:0,peakFireSales:0,
      nextLoanId:1,ledger:[],maxClearingResidual:0,lastCreditFunding:0,lastEquityFunding:0};
    // All amounts below are synthetic. Deposits are model claims, not actual bank data.
    for(const [key,value] of Object.entries(w.params))if(!Number.isFinite(value)||value<0||value>20)throw Error('Invalid parameter '+key);
    const initial=[
      ['labA','credit',22,.10,8],['labA','bankA',12,.085,6],['labB','credit',18,.12,7],['labB','bankB',10,.10,5],
      ['cloud','bankA',55,.08,8],['cloud','bankB',25,.085,7],['cloud','credit',45,.11,6],['cloud','chip',15,.09,8],
      ['hyper','bankA',35,.06,12],['hyper','foreign',50,.065,12],['hyper','domestic',35,.06,10],
      ['chip','bankB',25,.065,10],['chip','foreign',20,.07,12],['legacy','bankA',65,.07,10],['legacy','credit',32,.09,8],
      ['credit','bankA',60,.07,7],['credit','bankB',35,.075,9],['credit','foreign',28,.08,8],
      ['bankA','bankB',25,.05,8],['bankB','bankA',20,.05,9],
      ['bankA','domestic',450,.02,60,'deposit'],['bankA','foreign',45,.03,10],
      ['bankB','domestic',350,.02,60,'deposit'],['bankB','foreign',30,.03,10]
    ];
    for(const [borrower,lender,amount,rate,maturity,type] of initial) {
      w.loans.push({id:'L'+w.nextLoanId++,borrower,lender,principal:amount,rate,maturity,type:type||'loan',initial:true,amortization:type==='deposit'?0:.025,origLtv:.95,secured:borrower==='cloud'});
    }
    // Initial bank equity/assets is a disclosed simulation assumption, not a CET1 ratio.
    const initialBankBuffer=opts.bankBuffer===undefined?.105:Number(opts.bankBuffer);
    if(!(initialBankBuffer>=.04&&initialBankBuffer<=.30))throw Error('bankBuffer outside [.04,.30]');
    w.bankBuffer=initialBankBuffer;
    for(const id of ['bankA','bankB']) {
      const deposit=w.loans.find(l=>l.borrower===id&&l.type==='deposit');
      const otherDebt=liabilities(w,id)-deposit.principal;
      deposit.principal=assets(w,id)*(1-initialBankBuffer)-otherDebt;
    }
    w.contracts=[{id:'C1',payer:'labA',payee:'cloud',quarterly:12,start:1,end:12,type:'compute',cancelable:false},
      {id:'C2',payer:'labB',payee:'cloud',quarterly:9,start:1,end:12,type:'compute',cancelable:false},
      {id:'C3',payer:'hyper',payee:'cloud',quarterly:11,start:1,end:12,type:'compute',cancelable:false},
      {id:'C4',payer:'labA',payee:'hyper',quarterly:3,start:1,end:12,type:'compute',cancelable:false},
      {id:'C5',payer:'labB',payee:'hyper',quarterly:2,start:1,end:12,type:'compute',cancelable:false}];
    w.guarantees=[{id:'G1',guarantor:'chip',loanId:'L5',cap:18,remaining:18,coverage:.8},
      {id:'G2',guarantor:'hyper',loanId:'L1',cap:12,remaining:12,coverage:.8}];
    for(const n of nodes.filter(n=>['lab','cloud','chip','hyper','legacy','bank','credit'].includes(n.kind))) {
      n.marketCap=Math.max(5,netWorth(w,n.id))*(['bank','credit'].includes(n.kind)?1.1:1.7);
      n.baseMarketCap=n.marketCap;
      w.equityHoldings.push({holder:'domestic',issuer:n.id,shares:62},{holder:'foreign',issuer:n.id,shares:38});
    }
    w.initialPolicy=clone(w.policy);w.fiscalActionQuarter=0;
    w.initialNetWorth=Object.fromEntries(nodes.map(n=>[n.id,netWorth(w,n.id)]));
    w.baseCapacity=nodes.reduce((a,n)=>a+n.gpu,0);w.ai.capacity=w.baseCapacity;
    w.labor=Labor.create(opts.laborConfig);
    Object.assign(w.macro,Labor.metrics(w.labor));
    w.initialLoans=clone(w.loans);w.initialContracts=clone(w.contracts);w.initialGuarantees=clone(w.guarantees);
    w.history.push(snapshot(w,{grossLoss:0,netLoss:0,fireSales:0,newDefaults:[],clearingRounds:0,creditFunding:0,equityFunding:0}));
    return w;
  }
  const node=(w,id)=>w.nodes.find(n=>n.id===id);
  const alive=(w,id)=>{const n=node(w,id);return n&&!n.closed;};
  const treasuryPrice=w=>Math.exp(-w.params.rateDuration*(w.macro.treasuryYield-4.3)/100);
  function assets(w,id) {
    const n=node(w,id);let total=n.cash+n.gpu*w.ai.gpuPrice+n.other+n.treasury*treasuryPrice(w);
    total+=sum(w.loans.filter(l=>l.lender===id).map(l=>l.principal));
    total+=sum(w.equityHoldings.filter(h=>h.holder===id).map(h=>{const c=node(w,h.issuer);return c.shares>0?h.shares/c.shares*c.marketCap:0;}));
    return total;
  }
  function liabilities(w,id) {return sum(w.loans.filter(l=>l.borrower===id).map(l=>l.principal));}
  function netWorth(w,id){return assets(w,id)-liabilities(w,id);}
  function capitalRatio(w,id){return netWorth(w,id)/Math.max(1,assets(w,id));}
  function log(w,type,text,amount=0){w.events.push({quarter:w.quarter,type,text,amount});}
  function cashTransfer(w,from,to,amount,reason) {
    if(!(amount>=0&&Number.isFinite(amount)))throw Error('Invalid transfer');
    if(amount<EPS)return;
    if(from!==null){const a=node(w,from);if(!a)throw Error('Unknown transfer source');if(a.cash+1e-6<amount)throw Error('Cash overdraft '+from+' '+reason);a.cash-=amount;}
    else w.externalCashNet+=amount;
    if(to!==null){const b=node(w,to);if(!b)throw Error('Unknown transfer target');b.cash+=amount;}
    else w.externalCashNet-=amount;
    w.ledger.push({quarter:w.quarter,from,to,amount,reason});
  }
  function addLoan(w,borrower,lender,amount,rate,maturity,extra={}) {
    if(amount<EPS)return null;
    cashTransfer(w,lender,borrower,amount,'new_loan');
    const l={id:'L'+w.nextLoanId++,borrower,lender,principal:amount,rate,maturity,type:'loan',amortization:.025,origLtv:w.policy.ltv,issuedQuarter:w.quarter,secured:false,...extra};
    w.loans.push(l);return l;
  }
  function issueEquity(w,issuer,holder,amount){
    if(amount<EPS)return;
    const n=node(w,issuer),price=Math.max(.01,n.marketCap/n.shares),shares=amount/price;
    cashTransfer(w,holder,issuer,amount,'equity_issuance');
    n.shares+=shares;n.marketCap+=amount;
    let h=w.equityHoldings.find(x=>x.holder===holder&&x.issuer===issuer);
    if(!h){h={holder,issuer,shares:0};w.equityHoldings.push(h);}h.shares+=shares;
  }
  function drivers(w) {
    const q=w.quarter,s=w.severity,active=q>=4?Math.min(1,(q-3)/2):0,noise=w.shocks[q];
    let demandShock=0,competition=0,displacement=0,rateShock=0,obsolescence=0,confidenceShock=0,techBoost=0;
    if(w.scenario==='stagnation'){demandShock=.25*s*active;confidenceShock=.35*s*active;techBoost=-.04*s*active;}
    if(w.scenario==='disappointment'){demandShock=.62*s*active;obsolescence=.42*s*active;confidenceShock=.75*s*active;}
    if(w.scenario==='competition'){competition=.6*s*active;obsolescence=.45*s*active;confidenceShock=.3*s*active;techBoost=.045*s*active;}
    if(w.scenario==='displacement'){displacement=.65*s*active;techBoost=.055*s*active;demandShock=-.22*s*active;confidenceShock=.13*s*active;}
    if(w.scenario==='rates'){rateShock=2.6*s*active;confidenceShock=.35*s*active;demandShock=.13*s*active;}
    return {demandShock,competition,displacement,rateShock,obsolescence,confidenceShock,techBoost,noise,active};
  }
  function setPolicy(w,patch){if(['recapBudget','workerSupport','approvalLag'].some(k=>patch[k]!==undefined&&patch[k]!==w.policy[k]))w.fiscalActionQuarter=w.quarter;w.policy=validatePolicy({...w.policy,...patch});w.policyLog.push({quarter:w.quarter,policy:clone(w.policy)});log(w,'policy','政策调整将从下一季度生效。');}
  function sellAssets(w,n,wanted,liquidation=false) {
    if(wanted<=EPS)return 0;
    let got=0;
    const tp=treasuryPrice(w),takeT=Math.min(n.treasury,wanted/tp);
    if(takeT>0){n.treasury-=takeT;const cash=takeT*tp;cashTransfer(w,null,n.id,cash,'sell_treasury_to_outside');got+=cash;}
    const haircut=liquidation?.50:.84,price=Math.max(.015,w.ai.gpuPrice*haircut);
    const units=Math.min(n.gpu,Math.max(0,wanted-got)/price);
    if(units>0){n.gpu-=units;const cash=units*price;cashTransfer(w,null,n.id,cash,'sell_gpu_to_outside');got+=cash;}
    if(liquidation) {
      // Sell remaining financial claims to cash-rich investors before closing the estate.
      // Claims remain in the network; lender identity changes, face value does not.
      for(const loan of w.loans.filter(l=>l.lender===n.id&&l.principal>EPS)) {
        for(const buyer of ['domestic','foreign']) {
          if(buyer===n.id)continue;
          const bid=loan.principal*(loan.type==='deposit'?.95:.62),purchaser=node(w,buyer);
          if(purchaser.cash>=bid+20) {cashTransfer(w,buyer,n.id,bid,'liquidation_claim_sale');loan.lender=buyer;got+=bid;break;}
        }
      }
    }
    const recovery=liquidation?.42:.75,book=Math.min(n.other,Math.max(0,wanted-got)/recovery);
    if(book>0){n.other-=book;n.baseOther=Math.max(0,n.baseOther-book);const cash=book*recovery;cashTransfer(w,null,n.id,cash,'sell_other_assets_to_outside');got+=cash;}
    return got;
  }
  function raiseFiscalCash(w,needed) {
    const gov=node(w,'gov');let rem=Math.max(0,needed-gov.cash);
    for(const id of ['domestic','foreign']) {
      const inv=node(w,id),amount=Math.min(rem,Math.max(0,inv.cash-60));
      if(amount>0){addLoan(w,'gov',id,amount,w.macro.treasuryYield/100,w.quarter+40,{type:'treasury',amortization:0});w.fiscalDebt+=amount;rem-=amount;}
    }
    return rem<EPS;
  }
  function governmentActions(w,d) {
    const p=w.policy;
    if(w.quarter<Math.max(4,w.fiscalActionQuarter||0)+p.approvalLag)return;
    if(p.workerSupport>0){const amount=Math.min(p.workerSupport,Math.max(0,48-w.workerSpent));if(raiseFiscalCash(w,amount)){cashTransfer(w,'gov',null,amount,'worker_support');w.workerSpent+=amount;}}
    for(const b of w.nodes.filter(n=>n.kind==='bank'&&!n.closed)) {
      const target=(p.capitalTarget-p.bufferRelease)*assets(w,b.id),gap=Math.max(0,(target-netWorth(w,b.id))/(1-(p.capitalTarget-p.bufferRelease)));
      const amount=Math.min(gap,Math.max(0,p.recapBudget-w.recapSpent));
      if(amount>.05&&raiseFiscalCash(w,amount)){issueEquity(w,b.id,'gov',amount);w.recapSpent+=amount;w.govEquityCost+=amount;log(w,'rescue',b.name+'接受财政股权注资；原股东被稀释。',amount);}
    }
  }
  function fundingCapacity(w,lender,borrower,d){
    const l=node(w,lender),b=node(w,borrower);if(l.closed||b.closed)return 0;
    let cap=Math.max(0,l.cash-(l.kind==='bank'?18:8));
    const nw=Math.max(0,netWorth(w,lender));
    if(l.kind==='bank'){
      const target=Math.max(.04,w.policy.capitalTarget-(d.active?w.policy.bufferRelease:0));
      const ratio=capitalRatio(w,lender);
      cap*=clamp((ratio-target)/.07,0,1);
      const aiLoans=sum(w.loans.filter(x=>x.lender===lender&&['lab','cloud','hyper'].includes(node(w,x.borrower).kind)).map(x=>x.principal));
      cap=Math.min(cap,Math.max(0,w.policy.concentration*nw-aiLoans));
    }
    if(l.kind==='credit')cap*=clamp(nw/60,0,1);
    const debt=liabilities(w,borrower);
    if(b.gpu>1)cap=Math.min(cap,Math.max(0,w.policy.ltv*(b.gpu*w.ai.gpuPrice+b.other*.25)-debt));
    else cap=Math.min(cap,Math.max(0,.65*assets(w,borrower)-debt));
    const refiConfidence=clamp(w.ai.confidence*(b.kind==='lab'?1-d.demandShock*.8:1),0,1.1);
    return cap*refiConfidence;
  }
  function operatingBills(w,d) {
    const bills=[];const macroDemand=clamp(w.macro.gdp/100,.55,1.5);
    for(const n of w.nodes){
      if(n.closed||['government','centralbank'].includes(n.kind))continue;
      let factor=1;
      if(n.kind==='lab'){factor=w.ai.adoption*(1-d.demandShock)*(1-d.competition*.5)*(n.id==='labB'?1-d.competition*.75:1+d.competition*.2);}
      if(n.kind==='cloud')factor=w.ai.adoption*(1-.65*d.demandShock)*(1-.4*d.competition);
      if(n.kind==='chip')factor=1+.12*(w.ai.technology-1)-.30*d.demandShock;
      if(n.kind==='hyper')factor=1+.13*(w.ai.adoption-1)-.08*d.demandShock;
      if(n.kind==='legacy')factor=1-.62*d.displacement;
      const rev=Math.max(0,n.baseRevenue*factor*macroDemand*(1+.012*d.noise[0]));n.lastRevenue=rev;
      cashTransfer(w,null,n.id,rev,'outside_operating_revenue');
      // External asset coupons are outside the explicitly modelled Treasury issuance book.
      if(n.treasury>0)cashTransfer(w,null,n.id,n.treasury*.043/4,'legacy_treasury_coupon');
      let cost=n.baseCost*(1+.018*w.quarter)*(n.kind==='lab'?1+.05*(w.ai.technology-1):1);
      if(['investor','foreign','bank','credit'].includes(n.kind))cost=n.baseCost;
      bills.push({payer:n.id,payee:null,amount:cost,type:'operating'});
      n.lastProfit=rev-cost;
      
    }
    for(const c of w.contracts){if(w.quarter>=c.start&&w.quarter<=c.end&&alive(w,c.payer)&&alive(w,c.payee)){
      bills.push({payer:c.payer,payee:c.payee,amount:c.quarterly,type:'compute',contractId:c.id});
      node(w,c.payer).lastProfit-=c.quarterly;node(w,c.payee).lastProfit+=c.quarterly;
    }}
    for(const n of w.nodes.filter(n=>!n.closed&&!['government','centralbank'].includes(n.kind))) {
      const interest=sum(w.loans.filter(l=>l.borrower===n.id).map(l=>loanInterest(w,l)));
      n.lastProfit-=interest;
      const taxable=Math.max(0,n.lastProfit-.02*n.gpu*w.ai.gpuPrice);
      if(taxable>0)bills.push({payer:n.id,payee:'gov',amount:taxable*w.policy.taxRate,type:'tax'});
    }
    return bills;
  }
  function loanInterest(w,l){return l.issuedQuarter===w.quarter?0:l.principal*l.rate/4;}
  function plannedPrincipal(w,l,d){
    if(l.principal<EPS||l.issuedQuarter===w.quarter)return 0;
    if(w.quarter>=l.maturity)return l.principal;
    if(l.type==='deposit'){
      const withdrawal=w.currentWithdrawals?.[l.borrower]??clamp(.025*d.confidenceShock+.025*(1-w.macro.creditSupply)+(.04*(capitalRatio(w,l.borrower)<.07)),0,.18);
      return l.principal*withdrawal;
    }
    return l.principal*l.amortization;
  }
  function financeAndInvest(w,bills,d) {
    let creditFunding=0,equityFunding=0;
    // Banks can try to meet a higher target with genuinely paid-in equity.
    // Investor demand is bounded and may dry up; a regulatory target creates no capital by itself.
    if(w.ai.confidence>.55)for(const b of w.nodes.filter(n=>n.kind==='bank'&&!n.closed)) {
      const target=w.policy.capitalTarget;
      let gap=Math.max(0,(target*assets(w,b.id)-netWorth(w,b.id))/(1-target));
      for(const holder of ['domestic','foreign']) {
        const amount=Math.min(gap,3*w.ai.confidence,Math.max(0,node(w,holder).cash-100));
        if(amount>EPS){issueEquity(w,b.id,holder,amount);equityFunding+=amount;gap-=amount;}
      }
    }
    for(const n of w.nodes.filter(n=>!n.closed&&['lab','cloud','hyper','legacy'].includes(n.kind))){
      const due=sum(bills.filter(b=>b.payer===n.id).map(b=>b.amount))+sum(w.loans.filter(l=>l.borrower===n.id).map(l=>plannedPrincipal(w,l,d)+loanInterest(w,l)));
      const expectedIncoming=sum(bills.filter(b=>b.payee===n.id&&alive(w,b.payer)).map(b=>b.amount))*.8;
      const capex=n.baseCapex*w.policy.capexPace*clamp(w.ai.confidence+.2,.15,1.2);
      let need=Math.max(0,due+capex+8-n.cash-expectedIncoming);
      for(const lender of ['bankA','bankB','credit']){
        const amt=Math.min(need,fundingCapacity(w,lender,n.id,d),12);
        if(amt>EPS){const loan=addLoan(w,n.id,lender,amt,(w.macro.policyRate+w.macro.spread+(n.kind==='lab'?4:1))/100,w.quarter+8,{secured:n.kind==='cloud'});need-=amt;creditFunding+=amt;
          if(n.kind==='cloud'&&alive(w,'chip')) {
            const used=sum(w.guarantees.filter(g=>g.guarantor==='chip').map(g=>g.remaining));
            const headroom=Math.max(0,.16*Math.max(0,netWorth(w,'chip'))*w.policy.guaranteeLimit-used);
            const cap=Math.min(amt*.35,headroom);
            if(cap>EPS)w.guarantees.push({id:'G'+(w.guarantees.length+1),guarantor:'chip',loanId:loan.id,cap,remaining:cap,coverage:.8});
          }
        }
      }
      if(need>EPS&&w.ai.confidence>.48){
        for(const holder of ['domestic','foreign']){
          const budget=8*w.ai.confidence*(n.kind==='lab'?clamp(1-d.demandShock-d.competition*.4,0,1):.75);
          const amt=Math.min(need,budget,Math.max(0,node(w,holder).cash-100));
          if(amt>EPS){issueEquity(w,n.id,holder,amt);need-=amt;equityFunding+=amt;}
        }
      }
      // Discretionary capex is paid only out of residual cash: not a hidden debt.
      const amount=Math.min(capex,Math.max(0,n.cash+expectedIncoming-due-8));n.lastCapex=0;
      if(amount>EPS&&alive(w,'chip')){
        // Conservative: anticipated incoming cash cannot be spent before receipt.
        const paid=Math.min(amount,Math.max(0,n.cash-due-3));
        if(paid>EPS){cashTransfer(w,n.id,'chip',paid,'gpu_capex');n.gpu+=paid/Math.max(.3,w.ai.gpuPrice);n.lastCapex=paid;n.cumulativeCapex+=paid;
          cashTransfer(w,'chip',null,paid*.70,'chip_manufacturing_cost');node(w,'chip').lastProfit+=paid*.30;}
      }
    }
    return {creditFunding,equityFunding};
  }
  function clearingBook(w,ops,d,resolved){
    const bills=ops.map(x=>({...x}));
    for(const l of w.loans){if(l.principal<EPS)continue;
      const principal=resolved.has(l.borrower)?l.principal:plannedPrincipal(w,l,d);
      const interest=loanInterest(w,l);
      if(principal+interest>EPS)bills.push({payer:l.borrower,payee:l.lender,amount:principal+interest,principal,interest,loanId:l.id,type:'debt'});
    }
    const ids=w.nodes.map(n=>n.id),N=ids.length+1,idx=Object.fromEntries(ids.map((id,i)=>[id,i])),L=Array.from({length:N},()=>Array(N).fill(0));
    for(const b of bills){L[idx[b.payer]][b.payee===null?N-1:idx[b.payee]]+=b.amount;}
    const c=clearPayments([...w.nodes.map(n=>Math.max(0,n.cash)),0],L);
    return {bills,idx,N,L,c};
  }
  function provideLiquidity(w,b,cashGap){
    if(b.kind!=='bank'||w.policy.liquidityLine<=0||netWorth(w,b.id)<=0)return 0;
    const outstanding=sum(w.loans.filter(l=>l.lender==='fed').map(l=>l.principal));
    const capacity=Math.max(0,w.policy.liquidityLine-outstanding);
    const pledged=outstanding; // Conservative shared ceiling, no collateral double pledge.
    const collateral=Math.max(0,.75*(b.treasury*treasuryPrice(w)+b.other*.5)-pledged);
    const amount=Math.min(cashGap,capacity,collateral,node(w,'fed').cash);
    if(amount>EPS){addLoan(w,b.id,'fed',amount,(w.macro.policyRate+1)/100,w.quarter+4,{type:'liquidity',amortization:0});w.liquidityDrawn+=amount;log(w,'liquidity',b.name+'借入有抵押流动性；资产和负债同时增加。',amount);}
    return amount;
  }
  // Sequential capped guarantees: settlement follows primary debt resolution.
  // They do not change original debt face value and cannot overcompensate creditors.
  function settleGuarantees(w,losses) {
    let paidTotal=0;const records=[];
    for(const g of w.guarantees){
      const loss=losses.find(x=>x.loanId===g.loanId);if(!loss||loss.remaining<=EPS)continue;
      const claim=Math.min(g.remaining,loss.remaining*g.coverage);
      const guar=node(w,g.guarantor);if(guar.closed)continue;
      if(guar.cash<claim)sellAssets(w,guar,claim-guar.cash,false);
      const paid=Math.min(claim,guar.cash);cashTransfer(w,g.guarantor,loss.lender,paid,'guarantee_payment');
      guar.guaranteePaid+=paid;node(w,loss.lender).guaranteeRecovery+=paid;g.remaining-=paid;loss.remaining-=paid;paidTotal+=paid;
      records.push({guarantee:g.id,loanId:loss.loanId,guarantor:g.guarantor,borrower:loss.borrower,lender:loss.lender,claim,paid,unpaid:claim-paid});
      log(w,'guarantee',guar.name+'履行担保；这笔损失转移而非消失。',paid);
      if(claim-paid>EPS)log(w,'warning','未支付担保索赔；原型不求解同季度递归担保破产。',claim-paid);
    }
    return {paidTotal,records};
  }
  function settleQuarter(w,ops,d){
    let resolved=new Set(),fireSales=0,book=clearingBook(w,ops,d,resolved),rounds=0;
    // One liquidity-support and limited-sale round, then accelerated resolution.
    for(const n of w.nodes){const i=book.idx[n.id];if(n.closed)continue;const gap=book.c.due[i]-book.c.pay[i];
      if(gap>EPS){const loan=provideLiquidity(w,n,gap);const left=Math.max(0,gap-loan);if(left>EPS)fireSales+=sellAssets(w,n,Math.min(left,.15*(n.other+n.gpu*w.ai.gpuPrice+n.treasury*treasuryPrice(w))),false);}
    }
    if(fireSales>0)w.ai.gpuPrice*=Math.exp(-w.params.fireSaleElasticity*fireSales/Math.max(100,w.baseCapacity));
    for(;rounds<=w.nodes.length;rounds++){
      book=clearingBook(w,ops,d,resolved);
      const newIds=w.nodes.filter(n=>!n.closed&&!resolved.has(n.id)&&!['government','centralbank','investor','foreign'].includes(n.kind)&&book.c.ratios[book.idx[n.id]]<1-1e-7).map(n=>n.id);
      if(!newIds.length)break;
      for(const id of newIds){
        const n=node(w,id);n.defaultReason=netWorth(w,id)>0?'流动性不足':'资产不足';resolved.add(id);
        const sold=sellAssets(w,n,1e12,true);fireSales+=sold;
        log(w,'default',n.name+'进入简化清算（'+n.defaultReason+'），债务提前到期。');
      }
      // Further liquidation moves the common resale price; next round recomputes needs.
      w.ai.gpuPrice=clamp(w.ai.gpuPrice*Math.exp(-w.params.fireSaleElasticity*.15*fireSales/Math.max(100,w.baseCapacity)),.03,2.5);
    }
    if(rounds>w.nodes.length)throw Error('Resolution failed to terminate');
    w.maxClearingResidual=Math.max(w.maxClearingResidual,book.c.residual);
    const delta=Array(w.nodes.length).fill(0);let outside=0;
    for(let i=0;i<book.N;i++)for(let j=0;j<book.N;j++){
      const v=book.c.flows[i][j];if(v<EPS)continue;
      if(i<w.nodes.length)delta[i]-=v;else outside+=v;
      if(j<w.nodes.length)delta[j]+=v;else outside-=v;
    }
    w.nodes.forEach((n,i)=>{n.cash+=delta[i];if(n.cash<0&&n.cash>-1e-6)n.cash=0;});w.externalCashNet+=outside;
    w.ledger.push({quarter:w.quarter,recordType:'summary',reason:'simultaneous_clearing',outsideNet:outside,totalPaid:sum(book.c.pay),residual:book.c.residual});
    for(const b of book.bills){const paid=b.amount*book.c.ratios[book.idx[b.payer]];if(paid>EPS)w.ledger.push({quarter:w.quarter,recordType:'payment',reason:'settled_due',category:b.type,from:b.payer,to:b.payee,amount:paid,due:b.amount,claimId:b.loanId||b.contractId||null});}
    const losses=[];let grossLoss=0;
    for(const b of book.bills){if(b.type!=='debt')continue;
      const l=w.loans.find(x=>x.id===b.loanId),r=book.c.ratios[book.idx[b.payer]],loss=b.principal*(1-r);
      // Due principal is either repaid or written off exactly once.
      l.principal=Math.max(0,l.principal-b.principal);
      if(loss>EPS){node(w,b.payee).grossCreditLoss+=loss;grossLoss+=loss;losses.push({loanId:l.id,lender:l.lender,borrower:l.borrower,loss,remaining:loss});if(l.lender==='fed')w.liquidityLoss+=loss;}
    }
    const g=settleGuarantees(w,losses);
    // Guarantee receipts arriving in a resolved estate go to its unpaid creditors
    // before shareholders. Subrogation replaces the original creditor's paid claim.
    const recoveryBills=[];
    for(const b of book.bills) {
      if(!resolved.has(b.payer))continue;
      const unpaid=b.amount*(1-book.c.ratios[book.idx[b.payer]]);
      const covered=b.loanId?sum(g.records.filter(r=>r.loanId===b.loanId).map(r=>r.paid)):0;
      if(unpaid-covered>EPS)recoveryBills.push({...b,amount:unpaid-covered});
    }
    for(const rec of g.records)if(rec.paid>EPS&&resolved.has(rec.borrower))recoveryBills.push({payer:rec.borrower,payee:rec.guarantor,amount:rec.paid,type:'subrogation'});
    let estateRecovery=0;
    if(recoveryBills.length) {
      const R=Array.from({length:book.N},()=>Array(book.N).fill(0));
      for(const b of recoveryBills)R[book.idx[b.payer]][b.payee===null?book.N-1:book.idx[b.payee]]+=b.amount;
      const recovery=clearPayments([...w.nodes.map(n=>resolved.has(n.id)?n.cash:0),0],R);
      const delta2=Array(w.nodes.length).fill(0);let external2=0;
      for(let i=0;i<book.N;i++)for(let j=0;j<book.N;j++){
        const v=recovery.flows[i][j];if(i<w.nodes.length)delta2[i]-=v;else external2+=v;if(j<w.nodes.length)delta2[j]+=v;else external2-=v;
      }
      w.nodes.forEach((n,i)=>{n.cash+=delta2[i];if(n.cash<0&&n.cash>-1e-6)n.cash=0;});w.externalCashNet+=external2;
      for(const b of recoveryBills)if(b.type==='debt'){
        const loss=losses.find(x=>x.loanId===b.loanId);if(!loss)continue;
        const recovered=loss.remaining*recovery.ratios[book.idx[b.payer]];
        loss.remaining-=recovered;estateRecovery+=recovered;node(w,b.payee).guaranteeRecovery+=recovered;
      }
      w.maxClearingResidual=Math.max(w.maxClearingResidual,recovery.residual);
      w.ledger.push({quarter:w.quarter,recordType:'summary',reason:'estate_recovery_waterfall',outsideNet:external2,principalRecovery:estateRecovery});
      for(const b of recoveryBills){const paid=b.amount*recovery.ratios[book.idx[b.payer]];if(paid>EPS)w.ledger.push({quarter:w.quarter,recordType:'payment',reason:'estate_recovery_payment',category:b.type,from:b.payer,to:b.payee,amount:paid,due:b.amount,claimId:b.loanId||b.contractId||null});}
    }
    for(const id of resolved){const n=node(w,id);n.closed=true;n.defaultQuarter=w.quarter;n.marketCap=0;n.lastCapex=0;
      const residual=Math.max(0,n.cash);
      for(const h of w.equityHoldings.filter(h=>h.issuer===id)) {
        const payout=residual*h.shares/n.shares;if(payout>EPS){cashTransfer(w,id,h.holder,payout,'liquidation_equity_residual');n.dividends+=payout;}
      }
    }
    w.loans=w.loans.filter(l=>l.principal>EPS);
    w.cumulativeCreditLoss+=grossLoss-g.paidTotal-estateRecovery;w.cumulativeGrossCreditLoss+=grossLoss;w.peakFireSales=Math.max(w.peakFireSales,fireSales);
    return {grossLoss,netLoss:grossLoss-g.paidTotal-estateRecovery,estateRecovery,guaranteePaid:g.paidTotal,fireSales,newDefaults:[...resolved],clearingRounds:rounds,losses,guaranteeRecords:g.records};
  }
  function updateMacro(w,d,result){
    const m=w.macro,priorGdp=m.gdp;
    const banks=w.nodes.filter(n=>n.kind==='bank'),avgCapital=sum(banks.map(n=>n.closed?0:Math.max(0,capitalRatio(w,n.id))))/banks.length;
    const target=Math.max(.04,w.policy.capitalTarget-(d.active?w.policy.bufferRelease:0));
    m.creditSupply=clamp((avgCapital/target)*.85,0,1.15)*(1-.20*d.confidenceShock);
    const closures=w.nodes.filter(n=>n.closed&&['bank','credit'].includes(n.kind)).length;
    const lossShock=result.netLoss/100;
    const capex=sum(w.nodes.map(n=>n.lastCapex)),capexGap=(capex-50)/50;
    const techGain=(w.ai.technology-1)*.24;
    const workerRelief=Math.min(.6,w.workerSpent/45);
    const laborDemandChange=(w.labor.incomeIndex-w.labor.previousIncomeIndex)/100;
    const growth=.0045+.0018*techGain+.0025*capexGap-.012*(1-m.creditSupply)*w.params.creditFeedback-.004*lossShock-.0025*closures-.006*d.displacement*(1-workerRelief)+w.labor.config.demandFeedback*laborDemandChange;
    m.gdp=Math.max(.01,m.gdp*(1+clamp(growth,-.5,.5))); // no arbitrary 35-point GDP floor
    const annualGrowth=400*(m.gdp/priorGdp-1);
    const actualWorkerSpending=sum(w.ledger.filter(e=>e.quarter===w.quarter&&e.reason==='worker_support').map(e=>e.amount));
    Object.assign(m,Labor.step(w.labor,{quarter:w.quarter,gdp:m.gdp,displacement:d.displacement,actualWorkerSpending}));
    m.inflation=clamp(.75*m.inflation+.25*(2+.45*d.rateShock+.12*(annualGrowth-1.8)-.3*(w.ai.technology-1)),.1,12);
    const taylor=2.5+1.3*(m.inflation-2)-.25*((m.unemployment===null?100:m.unemployment)-4.5)-.30*Math.max(0,m.employmentLossPP)+.35*d.rateShock;
    m.policyRate=clamp(.65*m.policyRate+.35*taylor,0,12);
    const govIncrement=liabilities(w,'gov');
    const termPremium=.45+.006*govIncrement+.12*d.rateShock;
    const safeHaven=-.3*d.confidenceShock;
    m.treasuryYield=clamp(.55*m.policyRate+.45*3.1+termPremium+safeHaven,0.1,15);
    m.spread=clamp(1.3+3.6*d.confidenceShock+2.4*(1-m.creditSupply)+.25*closures+1.4*lossShock,.7,25);
    m.dollar=clamp(100+2.0*(m.policyRate-4)+6*d.confidenceShock-.035*govIncrement+.05*(m.gdp-100),60,150);
    m.politicalSupport=clamp(60-2*((m.unemployment===null?100:m.unemployment)-4.5)-2*Math.max(0,m.employmentLossPP)-2*(m.inflation-2.5)-.025*govIncrement,5,90);
    const previousCapacity=w.ai.capacity;
    w.ai.capacity=sum(w.nodes.filter(n=>!n.closed).map(n=>n.gpu));
    w.ai.technology*=1+Math.max(0,.012+.013*Math.sqrt(Math.max(0,capex)/50)+d.techBoost);
    w.ai.adoption=clamp(w.ai.adoption*(1+.022*w.params.adoptionElasticity+.005*(w.ai.technology-1)),.5,3);
    const fundamentalPrice=clamp((.98**w.quarter)*(1-d.obsolescence)*Math.pow(w.baseCapacity/Math.max(100,w.ai.capacity),.25),.05,1.4);
    // Scarcity cannot erase this quarter's liquidation discount instantly.
    w.ai.gpuPrice=clamp(.78*w.ai.gpuPrice+.22*fundamentalPrice,.03,2);
    w.ai.computePrice=clamp((1-.65*d.competition)*(1-.4*d.demandShock)*Math.pow(w.baseCapacity/Math.max(150,w.ai.capacity),.2)/Math.pow(w.ai.technology,.25),.1,2);
    w.ai.confidence=clamp(1-d.confidenceShock-.04*closures-.002*Math.max(0,(m.unemployment===null?100:m.unemployment)-5)-.004*Math.max(0,m.employmentLossPP)+.015*d.noise[2],.03,1.05);
    for(const n of w.nodes){
      if(n.closed){n.marketCap=0;continue;}if(!n.baseMarketCap)continue;
      const book=Math.max(0,netWorth(w,n.id));
      const profitFactor=clamp((n.lastRevenue/Math.max(.1,n.baseRevenue)),.05,3);
      const discount=Math.exp(-2.5*((m.treasuryYield-4.3)+(m.spread-1.8)*.5)/100);
      const targetValue=Math.max(.01,n.baseMarketCap*(.45*book/Math.max(1,w.initialNetWorth[n.id])+.55*profitFactor)*discount*(.65+.35*w.ai.confidence));
      n.marketCap=.35*n.marketCap+.65*targetValue;
    }
    const relative=id=>{const n=node(w,id);return n.baseMarketCap?(n.marketCap/n.shares)/(n.baseMarketCap/100):1;};
    // Synthetic index baskets, not the actual S&P/Nasdaq constituent weights.
    const broad=.30*relative('hyper')+.12*relative('chip')+.05*relative('cloud')+.20*relative('legacy')+.08*(relative('bankA')+relative('bankB'))/2+.25*(m.gdp/100);
    const tech=.46*relative('hyper')+.25*relative('chip')+.12*relative('cloud')+.07*(relative('labA')+relative('labB'))/2+.10*(m.gdp/100);
    m.sp500=Math.max(1,100*broad);m.nasdaq=Math.max(1,100*tech);
    w.govEquityValue=sum(w.equityHoldings.filter(h=>h.holder==='gov').map(h=>h.shares/node(w,h.issuer).shares*node(w,h.issuer).marketCap));
    return {growth,capex,previousCapacity};
  }
  function snapshot(w,result){
    const foreign=node(w,'foreign');
    return {quarter:w.quarter,...clone(w.macro),technology:w.ai.technology,adoption:w.ai.adoption,gpuPrice:w.ai.gpuPrice*100,computePrice:w.ai.computePrice*100,
      capacity:w.ai.capacity,confidence:w.ai.confidence,defaults:w.nodes.filter(n=>n.closed).length,bankDefaults:w.nodes.filter(n=>n.kind==='bank'&&n.closed).length,
      cumulativeCreditLoss:w.cumulativeCreditLoss,cumulativeGrossCreditLoss:w.cumulativeGrossCreditLoss,recapSpent:w.recapSpent,workerSpent:w.workerSpent,
      govDebt:liabilities(w,'gov'),govEquityValue:w.govEquityValue,liquidityOutstanding:sum(w.loans.filter(l=>l.lender==='fed').map(l=>l.principal)),liquidityLoss:w.liquidityLoss,
      foreignWealth:assets(w,foreign.id),domesticWealth:assets(w,'domestic'),capex:sum(w.nodes.map(n=>n.lastCapex||0)),
      nodes:w.nodes.map(n=>({id:n.id,name:n.name,kind:n.kind,cash:n.cash,assets:assets(w,n.id),debt:liabilities(w,n.id),equity:netWorth(w,n.id),capitalRatio:capitalRatio(w,n.id),closed:n.closed,marketCap:n.marketCap,sharePrice:n.marketCap/n.shares,gpu:n.gpu,loss:n.grossCreditLoss-n.guaranteeRecovery})),
      labor:clone(w.labor),result:clone(result)};
  }
  function auditWorld(w){
    const cash=sum(w.nodes.map(n=>n.cash)),cashError=cash-(w.initialCash+w.externalCashNet);
    const loanAssets=sum(w.nodes.map(n=>sum(w.loans.filter(l=>l.lender===n.id).map(l=>l.principal))));
    const loanLiabilities=sum(w.nodes.map(n=>liabilities(w,n.id)));
    const reconstructed={...w.initialNodeCash};
    for(const entry of w.ledger)if(Number.isFinite(entry.amount)){
      if(entry.from!==null&&entry.from!==undefined)reconstructed[entry.from]-=entry.amount;
      if(entry.to!==null&&entry.to!==undefined)reconstructed[entry.to]+=entry.amount;
    }
    const maxNodeCashError=Math.max(...w.nodes.map(n=>Math.abs(n.cash-reconstructed[n.id])));
    const problems=[];
    if(maxNodeCashError>1e-5)problems.push('per-node cash journal');
    if(Math.abs(cashError)>1e-5)problems.push('cash conservation');
    if(Math.abs(loanAssets-loanLiabilities)>1e-6)problems.push('loan mirror');
    if(w.nodes.some(n=>n.cash< -1e-6||!Number.isFinite(n.cash)))problems.push('negative/nonfinite cash');
    if(w.loans.some(l=>l.principal< -EPS||!Number.isFinite(l.principal)))problems.push('negative/nonfinite principal');
    if(w.guarantees.some(g=>g.remaining< -EPS||g.remaining>g.cap+EPS))problems.push('guarantee cap');
    for(const [key,v] of Object.entries(w.macro))if(!Number.isFinite(v)&&!(key==='unemployment'&&v===null))problems.push('nonfinite macro');
    const laborPopulationError=Labor.audit(w.labor);
    const r={quarter:w.quarter,laborPopulationError,cashError,maxNodeCashError,loanMirrorError:loanAssets-loanLiabilities,clearingResidual:w.maxClearingResidual,ok:problems.length===0,problems};
    if(problems.length)throw Error('Audit failed: '+problems.join(', '));return r;
  }
  function step(w,policyPatch){
    if(w.quarter>=48)throw Error('Prototype horizon is 48 quarters');
    if(policyPatch)setPolicy(w,policyPatch);w.quarter++;
    const d=drivers(w);w.nodes.forEach(n=>{n.lastCapex=0;if(!n.closed)n.gpu*=.98;});
    w.ai.confidence=clamp(1-d.confidenceShock-.04*w.nodes.filter(n=>n.closed).length+.015*d.noise[2],.03,1.05);
    // Revalue external business assets, not cash. Investor prices are separately marked.
    for(const n of w.nodes.filter(n=>!n.closed&&n.baseOther>0)){
      let stress=1;
      if(n.kind==='lab')stress=1-.72*d.demandShock-.4*d.competition;
      if(n.kind==='cloud')stress=1-.5*d.demandShock;
      if(n.kind==='legacy')stress=1-.65*d.displacement;
      if(n.kind==='bank')stress=1-.012*Math.max(0,100-w.macro.humanWorkIndex)-.06*d.displacement;
      n.other=n.baseOther*clamp(stress,.15,1.3)*clamp(w.macro.gdp/100,.5,1.3);
    }
    w.ai.gpuPrice=clamp(w.ai.gpuPrice*(1-.18*d.obsolescence),.03,2);
    w.currentWithdrawals=Object.fromEntries(w.nodes.filter(n=>n.kind==='bank').map(n=>[n.id,clamp(.025*d.confidenceShock+.025*(1-w.macro.creditSupply)+(.04*(capitalRatio(w,n.id)<.07)),0,.18)]));
    // Rollover is an extension of an existing loan, not new money or debt forgiveness.
    for(const l of w.loans.filter(l=>l.type==='liquidity'&&l.maturity<=w.quarter)) {
      const b=node(w,l.borrower),total=sum(w.loans.filter(x=>x.type==='liquidity').map(x=>x.principal));
      if(!b.closed&&netWorth(w,b.id)>0&&total<=w.policy.liquidityLine&&.75*(b.other*.5+b.treasury*treasuryPrice(w))>=l.principal) {
        l.maturity=w.quarter+4;log(w,'liquidity','满足偿付和抵押条件，流动性贷款展期；本金仍在账上。',l.principal);
      }
    }
    governmentActions(w,d);
    const bills=operatingBills(w,d);
    // Treasury can use an explicitly recorded residual tax source to service its public debt.
    const govDue=sum(w.loans.filter(l=>l.borrower==='gov').map(l=>loanInterest(w,l)));
    if(govDue>node(w,'gov').cash)cashTransfer(w,null,'gov',govDue-node(w,'gov').cash,'outside_tax_for_public_debt_service');
    const funding=financeAndInvest(w,bills,d);
    const result={...settleQuarter(w,bills,d),...funding};
    updateMacro(w,d,result);w.audit.push(auditWorld(w));w.history.push(snapshot(w,result));return w.history[w.history.length-1];
  }
  function run(opts={}){const w=createWorld(opts),quarters=opts.quarters===undefined?16:opts.quarters;if(!Number.isInteger(quarters)||quarters<0||quarters>48)throw Error('Invalid quarters');for(let t=0;t<quarters;t++){if(opts.policySchedule&&opts.policySchedule[t+1])setPolicy(w,opts.policySchedule[t+1]);step(w);}return w;}
  function summarize(w){const first=w.history[0],last=w.history[w.history.length-1];return {scenario:w.scenario,seed:w.seed,severity:w.severity,quarters:w.quarter,
    defaults:last.defaults,bankDefaults:last.bankDefaults,netCreditLoss:last.cumulativeCreditLoss,grossCreditLoss:last.cumulativeGrossCreditLoss,
    sp500:last.sp500,nasdaq:last.nasdaq,gdp:last.gdp,gdpChange:last.gdp-100,peakUnemployment:Math.max(...w.history.map(x=>x.unemployment===null?0:x.unemployment)),
    employmentRate:last.employmentRate,nonEmploymentRate:last.nonEmploymentRate,participationRate:last.participationRate,humanWorkIndex:last.humanWorkIndex,employmentIndex:last.employmentIndex,unemployment:last.unemployment,
    minEmploymentRate:Math.min(...w.history.map(x=>x.employmentRate)),peakNonEmploymentRate:Math.max(...w.history.map(x=>x.nonEmploymentRate)),
    gpuPrice:last.gpuPrice,technology:last.technology,cumulativeCapex:sum(w.nodes.map(n=>n.cumulativeCapex)),recapSpent:w.recapSpent,workerSpent:w.workerSpent,
    incrementalGovDebt:last.govDebt,govEquityValue:w.govEquityValue,liquidityOutstanding:last.liquidityOutstanding,liquidityLoss:w.liquidityLoss,
    foreignWealthChange:100*(last.foreignWealth/first.foreignWealth-1),maxCashError:Math.max(0,...w.audit.map(x=>Math.abs(x.cashError))),maxClearingResidual:w.maxClearingResidual};}
  function compare(opts={}){return Object.entries(PRESETS).map(([id,p])=>({id,label:p.label,summary:summarize(run({...opts,policy:id==='late'?DEFAULT_POLICY:p.policy,policySchedule:id==='late'?{4:p.policy}:undefined}))}));}
  function stressGrid(opts={}){
    const results=[];for(let i=0;i<=15;i++){const w=run({...opts,severity:i/10});results.push(summarize(w));}
    return {criterion:'at least one bank default by the horizon',testedStep:.1,range:[0,1.5],firstBreached:results.find(r=>r.bankDefaults>0)?.severity??null,results,
      warning:'A finite scenario grid, not a proof of robustness or a default probability; non-monotonicity is allowed.'};
  }
  function exportRun(w){return {schema:'ai-finance-run-v1',version:VERSION,config:{scenario:w.scenario,seed:w.seed,severity:w.severity,bankBuffer:w.bankBuffer,params:clone(w.params),laborConfig:clone(w.labor.config),policy:clone(w.initialPolicy)},quarter:w.quarter,policyLog:clone(w.policyLog),summary:summarize(w),history:clone(w.history),events:clone(w.events),audit:clone(w.audit),loans:clone(w.loans),guarantees:clone(w.guarantees),contracts:clone(w.contracts),ledger:clone(w.ledger)};}
  function replay(data){
    if(data.schema!=='ai-finance-run-v1'||data.version!==VERSION||!Number.isInteger(data.quarter)||data.quarter<0||data.quarter>48||!Array.isArray(data.policyLog)||data.policyLog.length>1000)throw Error('存档版本不兼容或格式错误；0.2.0 新就业模型不能精确复现旧版存档，请保留旧版页面回放。');
    for(const e of data.policyLog){if(!Number.isInteger(e.quarter)||e.quarter<0||e.quarter>data.quarter)throw Error('Invalid policy time');validatePolicy(e.policy);}
    const w=createWorld(data.config);
    for(let q=0;q<data.quarter;q++){for(const e of data.policyLog.filter(e=>e.quarter===q))setPolicy(w,e.policy);step(w);}
    for(const e of data.policyLog.filter(e=>e.quarter===data.quarter))setPolicy(w,e.policy);
    return w;
  }
  return {Labor,VERSION,SCENARIOS,DEFAULT_POLICY,PRESETS,createWorld,step,run,compare,summarize,stressGrid,clearPayments,auditWorld,setPolicy,netWorth,capitalRatio,assets,liabilities,settleGuarantees,validatePolicy,exportRun,replay,clone,rng};
});
