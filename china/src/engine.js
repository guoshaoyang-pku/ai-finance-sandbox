/* China AI stress sandbox. All future paths are conditional assumptions, not forecasts. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('../data/baseline.json'));else root.ChinaEngine=factory(root.ChinaData);})(typeof globalThis!=='undefined'?globalThis:this,function(DATA){
'use strict';
const VERSION='cn-0.2.0', clone=x=>JSON.parse(JSON.stringify(x)), clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), sum=a=>a.reduce((x,y)=>x+y,0);
// q is the elapsed MONTH index (retained as an internal chart key); saved files carry timeUnit.
const PERIODS_PER_YEAR=12, MAX_MONTHS=180;
// Convert a quarterly transition probability into a monthly probability.
// A speed of 3 moves one legacy-quarter response into one month, NOT three times the cash.
function monthRate(quarterProbability,speed=1){return 1-Math.pow(1-clamp(quarterProbability,0,1),speed/3);}
function annualFlow(value){return value/PERIODS_PER_YEAR;}
function initialMaturities(debt,shortDebt){
 const a=Array(MAX_MONTHS+37).fill(0);
 for(let month=1;month<=12;month++)a[month]=shortDebt/12;
 for(let month=13;month<=72;month++)a[month]=(debt-shortDebt)/60;
 return a;
}
const CONFIG_FIELDS={
 shockStart:{label:'冲击开始月份',min:1,max:24,step:1,unit:'月',value:1,help:'第几个月开始冲击；不再暗设四个季度的等待。'},
 shockRamp:{label:'从启动到峰值',min:1,max:24,step:1,unit:'个月',value:6,help:'1表示启动当月达到设定强度；6表示六个月线性上升。是压力假设，不是事实估计。'},
 transmissionSpeed:{label:'传导速度',min:1,max:6,step:.5,unit:'×',value:3,help:'3×将旧版一个季度的需求调整、采用和风险转移压入一个月；收入、年预算和债务期限不乘三。'},
 lossWindow:{label:'额外本金损失确认期',min:1,max:36,step:1,unit:'个月',value:8,help:'从冲击启动月起分摊给定损失，总额不变；缩短确认期会更快消耗银行资本。'},
 trainingLag:{label:'转岗支出执行滞后',min:1,max:12,step:1,unit:'个月',value:2,help:'支出经过这些月份才影响招聘；与传导倍数分开。'},
 exportLoss:{label:'外需最大下降',min:0,max:.60,step:.01,unit:'%',value:.20,help:'相对无冲击出口需求路径。不是当前出口已经下降。'},
 aiReturn:{label:'峰值AI回报兑现比例',min:0,max:1.5,step:.05,unit:'%',value:.25,help:'冲击峰值时的兑现比例，随冲击消退恢复；回报低不等于技术停止替代岗位。'},
 fundingFreeze:{label:'市场续借收缩',min:0,max:1,step:.05,unit:'%',value:.50,help:'到期融资可得性的冲击，央行流动性可以缓解但不会抹掉本金损失。'},
 landLoss:{label:'土地出让收入最大下降',min:0,max:.80,step:.05,unit:'%',value:.35,help:'土地毛收入减少只按可支配比例传入财政。'},
 otherLoss:{label:'非AI额外银行本金损失',min:0,max:100,step:1,unit:'万亿元',value:5,help:'外生施加的全系统压力，按下方确认期分月计入；不是模型从AI行业推算出的坏账。'},
 replacement:{label:'暴露岗位中的可替代份额',min:0,max:1,step:.05,unit:'%',value:.45,help:'默认35%岗位暴露，随技术采用逐步替代；不是直接指定失业率。'},
 newJobs:{label:'技术新增岗位补回比例',min:0,max:1.5,step:.05,unit:'%',value:.25,help:'新增岗位相对技术直接替代量，可以大于100%。'},
 highMPC:{label:'高收入新增收入消费比例',min:0,max:1,step:.05,unit:'%',value:.10,help:'边际消费倾向假设，不能由观察到的平均储蓄率直接推定。普通群体默认85%。'},
 aiInvestment:{label:'全国AI年度投入起点',min:0,max:6,step:.1,unit:'万亿元/年',value:1.6,help:'未知总量的情景输入，包含实名公司，不与其资本支出重复相加。'},
 vcInitial:{label:'具身历史股权投入',min:0,max:2,step:.05,unit:'万亿元',value:.2,help:'工作情景，不是已核验实缴额。股权亏损与银行贷款损失分别记录。'},
 vcAnnual:{label:'具身年度融资起点',min:0,max:1,step:.02,unit:'万亿元/年',value:.16,help:'融资不等于当期支出；受市场续融收缩影响，不与全国AI投资直接相加。'},
 vcGrowth:{label:'具身融资年增速',min:-.3,max:.8,step:.05,unit:'%',value:.1,help:'前四年增长假设，此后计划融资额持平；用于测试累计万亿投入，不是机构预测。'},
 aiDebt:{label:'其他AI项目初始债务',min:0,max:30,step:.5,unit:'万亿元',value:4,help:'可调敞口假设，不含四家样本公司的债务；65%归银行。'},
 lgfvDebt:{label:'城投初始债务规模',min:0,max:100,step:5,unit:'万亿元',value:70,help:'研究量级假设；55%银行敞口已在贷款总量中，不与总贷款相加。'},
 bankRWA:{label:'银行风险加权资产',min:160,max:350,step:10,unit:'万亿元',value:250,help:'规模假设；与已披露15.26%资本比率相乘得到模型资本，非真实资本总额。'},
 cashUse:{label:'公司资金池可动用比例',min:.2,max:1,step:.05,unit:'%',value:.85,help:'对公开资金池统一折扣，模拟受限、期限、子公司资金隔离和营运预留。'},
 persistence:{label:'需求持续系数（旧季度基准）',min:.3,max:.95,step:.05,unit:'',value:.75,help:'每月保留比例=该系数^(传导倍数/3)。默认3×时，每月保留75%；1×每月约90.9%。未经历史估计。'},
 shockHalfLife:{label:'冲击消退半衰期',min:2,max:120,step:2,unit:'个月',value:16,help:'峰值后每经过这些月份，外部冲击减半。决定持续时间，不与传导倍数重复压缩。'},
 initialEmployment:{label:'初始就业人口比（合成样本）',min:45,max:80,step:1,unit:'%',value:65,help:'固定100人的合成城市样本；失业率以官方5.2%作锚，不冒充官方就业人口比。'},
 incomeRecovery:{label:'短期现金占用恢复程度',min:0,max:1,step:.1,unit:'%',value:.5,help:'按24个月时间常数，现金流向净利润加近似折旧靠拢的比例。0表示机械维持最近一期现金流；不是财报预测。'},
 seed:{label:'随机种子',min:1,max:999999,step:1,unit:'',value:42,help:'同一情景和种子使用完全相同的外部小扰动。'}
};
const POLICY_FIELDS={
 capexCut:{label:'可调整AI投入削减',min:0,max:.8,step:.05,unit:'%',value:0,help:'只削减可调整部分；有短期订单和长期能力代价。'},
 debtLimit:{label:'新增AI债务约束',min:0,max:1,step:.05,unit:'%',value:0,help:'限制新增融资，不追溯取消旧合同，不把旧债直接清零。'},
 liquidity:{label:'续借与流动性支持',min:0,max:1,step:.05,unit:'%',value:0,help:'缓解融资冻结，不等于财政注资，也不能修复负净资产。'},
 recap:{label:'银行注资年度上限',min:0,max:4,step:.25,unit:'万亿元/年',value:0,help:'只在资本低于模型目标12%时拨付；计入新增公共融资并取得金融资产。'},
 transfers:{label:'收入补贴年度上限',min:0,max:.025,step:.0025,unit:'GDP%',value:0,help:'随就业恶化启动，直接增加可消费收入；需要财政融资。'},
 training:{label:'转岗与就业支出',min:0,max:.005,step:.0005,unit:'GDP%',value:0,help:'按情景中的执行月数滞后，提高招聘；年度预算每月最多拨付1/12。'},
 localAid:{label:'地方财政支持年度上限',min:0,max:4,step:.25,unit:'万亿元/年',value:0,help:'填补压力造成的新增缺口，未用额度不支出；中央融资相应增加。'}
};
const PRESETS={
 none:{name:'不追加干预',desc:'维持投资与融资规则，让企业自行缩减支出。',policy:{}},
 guardrails:{name:'提前限投限债',desc:'约束新增风险；可能减少订单、岗位和技术收益。',policy:{capexCut:.45,debtLimit:.7,liquidity:.15}},
 rescue:{name:'续借与资本托底',desc:'缓解资金链、必要时补银行资本；公共融资上升。',policy:{liquidity:.9,recap:2,localAid:1}},
 jobs:{name:'优先就业与消费',desc:'把资源用于收入、转岗和地方支出；不是免费刺激。',policy:{capexCut:.2,debtLimit:.35,liquidity:.35,recap:.5,transfers:.0125,training:.002,localAid:1}},
 balanced:{name:'限新增风险＋托底',desc:'约束低回报扩张，同时补资本、保就业和地方服务。',policy:{capexCut:.4,debtLimit:.6,liquidity:.75,recap:1.5,transfers:.01,training:.002,localAid:1.5}},
 abrupt:{name:'突然急刹车',desc:'强压投资与新融资而不托底，用来观察短期收缩代价。',policy:{capexCut:.8,debtLimit:1,liquidity:0}}
};
const SCENARIOS={
 combined:{name:'多重冲击叠加',desc:'回报低、外需降、融资紧，加上非AI存量坏账。',config:{}},
 ai:{name:'AI回报落空',desc:'不预埋外需、全市场融资冻结、土地或其他行业巨额亏损；允许次生传导。',config:{exportLoss:0,aiReturn:.1,fundingFreeze:0,landLoss:0,otherLoss:0,replacement:.25,newJobs:.5}},
 demand:{name:'外需与就业恶化',desc:'技术继续落地，但新增收益集中、就业和消费修复慢。',config:{exportLoss:.35,aiReturn:.6,fundingFreeze:.3,landLoss:.2,otherLoss:2,replacement:.75,newJobs:.15,highMPC:.05}},
 credit:{name:'十万亿存量信用损失',desc:'另外施加10万亿银行最终本金损失，检查承受和传染。',config:{otherLoss:10,fundingFreeze:.75,landLoss:.45,aiReturn:.2}},
 tail:{name:'极端联合压力',desc:'30万亿外生损失、外需下降40%、长时间低回报；不是概率预测。',config:{otherLoss:30,exportLoss:.4,landLoss:.6,fundingFreeze:.9,replacement:.7,newJobs:.1,aiReturn:.1,shockHalfLife:32}},
 mild:{name:'温和对照',desc:'不设外需或信贷突变，允许AI收益兑现与岗位补回。',config:{exportLoss:0,aiReturn:1,fundingFreeze:0,landLoss:0,otherLoss:0,replacement:.15,newJobs:1,highMPC:.4,shockHalfLife:8}}
};
function normalize(input,fields){const o={};for(const [k,f] of Object.entries(fields)){const v=input&&input[k];o[k]=clamp(typeof v==='number'&&Number.isFinite(v)?v:f.value,f.min,f.max);if(['shockStart','shockRamp','lossWindow','trainingLag','seed'].includes(k))o[k]=Math.round(o[k]);}return o;}
function configFor(id){return normalize(SCENARIOS[id]?.config,CONFIG_FIELDS);}
function policyFor(id){return normalize(PRESETS[id]?.policy,POLICY_FIELDS);}
function random(seed,q){let x=(seed^Math.imul(q+17,0x45d9f3b))>>>0;x=Math.imul(x^(x>>>16),0x45d9f3b);x^=x>>>16;return (x>>>0)/4294967296;}
function envelope(month,c){if(month<c.shockStart)return 0;const d=month-c.shockStart+1;return d<=c.shockRamp?d/c.shockRamp:Math.pow(.5,(d-c.shockRamp)/c.shockHalfLife);}
function date(month){const v=2026*12+10+month;return `${Math.floor(v/12)}-${String(v%12+1).padStart(2,'0')}`;}
function create(config={},policy={}){
 const c=normalize(config,CONFIG_FIELDS),p=normalize(policy,POLICY_FIELDS),m=DATA.macro;
 const E=c.initialEmployment,U=E/(1-m.unemployment)-E,N=100-E-U;
 const firms=DATA.firms.map(f=>{
  const x={};for(const k of ['assets','liabilities','mezzanine','equity','cash','liquid','debt','shortDebt','revenue','ocf','capex','netIncome','extraPayments'])x[k]=f[k]/10000;
  const cash=x.liquid*c.cashUse,aiK=Math.min((x.capex/f.periodQuarters)*6*f.aiShare,(x.assets-cash)*.35),mat=initialMaturities(x.debt,x.shortDebt);
  return {id:f.id,name:f.name,cash,debt:x.debt,otherL:x.liabilities-x.debt,mezz:x.mezzanine,equity:x.equity,aiK,otherA:x.assets-cash-aiK,maturities:mat,alive:true,firstGap:null,firstInsolvent:null,impairLevel:0,cumLoss:0,last:{ocf:0,capex:0,interest:0,due:0,newDebt:0,shortfall:0},base:{...x,cash,aiK},meta:{aiShare:f.aiShare,domestic:f.domestic,fallThrough:f.fallThrough,investmentShare:f.investmentShare,period:f.periodQuarters*3}};
 });
 const firmLoan=sum(firms.map(f=>f.debt))*.55,aiLoan=c.aiDebt*.65,lgLoan=c.lgfvDebt*.55;
 const s={version:VERSION,timeUnit:'month',q:0,config:c,policy:p,initialPolicy:clone(p),policyHistory:[{q:0,policy:clone(p)}],firms,
  E,U,N,E0:E,U0:U,N0:N,adoption:.05,displaced:0,createdJobs:0,hours:1,consumption:1,gap:0,scar:0,gdpIndex:100,gdpGrowth:.04,peakJobless:m.unemployment,
  loans:m.loans,bankCapital:c.bankRWA*m.bankCAR,bankRWA:c.bankRWA,car:m.bankCAR,creditGap:0,
  aiDebt:c.aiDebt,lgfvDebt:c.lgfvDebt,otherLoans:Math.max(0,m.loans-firmLoan-aiLoan-lgLoan),firmLoans:firmLoan,
  localDebt:m.localDebt,localCut:0,localPressure:0,publicDebt:0,publicAssets:0,publicOutlays:0,arrears:0,
  losses:{ai:0,lgfv:0,other:0,firms:0},bankLosses:0,creditLosses:0,publicGuarantees:0,
  vcOutstanding:c.vcInitial,vcCumulative:c.vcInitial,vcLoss:0,investment:0,cumInvestment:0,productivity:0,stockIndex:100,
  otherShockRemaining:c.otherLoss,otherExogenousLoss:0,totalDefaulted:0,totalNewLending:0,previousStress:0,
  last:{external:0,credit:0,consumption:0,investment:0,fiscal:0,productivity:0,loss:0,recap:0,transfers:0,training:0,localAid:0,guarantee:0,bankProfit:0,unfunded:0},
  events:[{q:0,type:'info',title:'从公开数据出发',text:'四家财报与宏观存量作起点；未来冲击、传导系数和债务拆分是可调假设。'}],history:[]};
 s.history.push(snapshot(s));return s;
}
function addEvent(s,type,title,text){s.events.push({q:s.q,type,title,text});}
function snapshot(s){return {q:s.q,month:s.q,gdp:s.gdpIndex,baseline:100*Math.pow(1.04,s.q/12),gap:(Math.exp(s.gap)-1)*100,unemployment:100*s.U/(s.E+s.U||1),employment:s.E,participation:s.E+s.U,nonparticipation:s.N,hours:s.hours*100,consumption:s.consumption*100,car:s.car*100,creditGap:s.creditGap*100,loans:s.loans,loss:s.creditLosses,bankLoss:s.bankLosses,localDebt:s.localDebt,localCut:s.localCut*100,publicDebt:s.publicDebt,publicAssets:s.publicAssets,vc:s.vcCumulative,vcLoss:s.vcLoss,investment:s.cumInvestment,adoption:s.adoption*100,stock:s.stockIndex,lossAI:s.losses.ai,lossLGFV:s.losses.lgfv,lossOther:s.losses.other,lossOtherExogenous:s.otherExogenousLoss,lossFirms:s.losses.firms,transfers:s.last.transfers,training:s.last.training,fiscalSpending:s.publicOutlays,arrears:s.arrears,growth:s.gdpGrowth*100,firms:s.firms.map(f=>({id:f.id,cash:f.cash,equity:f.equity,debt:f.debt,status:f.alive?'active':'gap'}))};}
function firmStep(f,s,ctx){
 if(!f.alive)return {loss:0,principal:0,capex:0,aiCap:0};
 const {c,p,stress,roll,ret,trend}=ctx,b=f.base,m=f.meta,q=s.q;
 const scale=Math.pow(1.025,q/12),demand=Math.exp(s.gap*m.domestic)*(1-c.exportLoss*stress*(1-m.domestic));
 const opLoss=(b.revenue/m.period)*scale*Math.max(0,1-demand)*m.fallThrough;
 const normalizeShare=c.incomeRecovery*(1-Math.exp(-q/24));
 const normalOcf=(b.ocf/m.period)*(1-normalizeShare)+(b.netIncome/m.period+b.capex/m.period*.25)*normalizeShare;
 const payoff=Math.max(0,f.aiK-b.aiK)*.12*ret/12;
 const OCF=normalOcf*scale-opLoss+payoff;
 const extra=b.extraPayments/m.period+Math.max(0,f.debt-b.debt)*.04/12+f.debt*(c.fundingFreeze*stress*.025)*(1-p.liquidity*.5)/12;
 const initialCap=b.capex/m.period,runway=f.cash/Math.max(.0001,initialCap+extra-OCF);
 const voluntary=runway<24?.35:runway<48?.15:0;
 const aiPlan=initialCap*m.aiShare*trend*(c.aiInvestment/1.6),otherCap=initialCap*(1-m.aiShare);
 const aiCap=aiPlan*ctx.investmentFactor*(1-.45*voluntary);
 const capex=otherCap+aiCap;
 // On cash stress, cancel adjustable spend before borrowing; committed investment remains.
 const due=Math.min(f.debt,f.maturities[q]||0),rollDebt=due*roll;
 const leverageHead=Math.max(0,Math.max(0,f.equity)*(.8-.5*p.debtLimit)-Math.max(0,f.debt-due+rollDebt));
 const fundingNeed=Math.max(0,capex+extra+due-OCF-f.cash*monthRate(.3));
 const newNet=Math.min(fundingNeed,capex*.65*(1-p.debtLimit),leverageHead)*roll;
 const newDebt=rollDebt+newNet;
 f.maturities[q+36]+=newDebt;
 const depreciationRate=monthRate(1/20),dep=f.aiK*depreciationRate;
 const desiredImpair=(1-ret)*stress*.5,impairIncrease=Math.max(0,desiredImpair-f.impairLevel);
 const impairment=f.aiK*impairIncrease,otherImpair=f.otherA*m.investmentShare*impairIncrease*.3;
 f.impairLevel=Math.max(f.impairLevel,desiredImpair);
 const ni=b.netIncome/m.period*scale-opLoss+payoff-(extra-b.extraPayments/m.period)-Math.max(0,dep-b.aiK*depreciationRate)-impairment-otherImpair;
 const netOp=OCF-extra;
 f.cash+=netOp-capex-due+newDebt;f.debt+=newDebt-due;
 f.aiK+=aiCap-dep-impairment;
 // Cash/accrual bridge is explicit. It is NOT extra cash or an assumed profit.
 f.otherA+=otherCap+(ni-netOp+dep+impairment);
 f.equity+=ni;
 let saleBook=0,saleCash=0;
 if(f.cash<0){saleBook=Math.min(Math.max(0,f.otherA)*monthRate(.12),-f.cash/.65);saleCash=saleBook*.65;f.otherA-=saleBook;f.cash+=saleCash;f.equity-=saleBook-saleCash;}
 if(f.cash<0&&f.cash> -1e-12){f.otherA+=f.cash;f.cash=0;}
 let gap=Math.max(0,-f.cash),loss=0,principal=0;
 if(gap>1e-12){
  const missedPrincipal=Math.min(due,gap);f.debt+=missedPrincipal;f.cash+=missedPrincipal;
  if(f.cash<0){f.otherL+=-f.cash;f.cash=0;}
  f.alive=false;f.firstGap=q;principal=f.debt;loss=principal*(.45+.25*stress);
  addEvent(s,'bad',f.name+'触发模型支付缺口','本月缺口'+(gap*10000).toFixed(0)+'亿元；该公司停止继续外推。这是条件测试，不是现实破产判断。');
 }
 if(f.equity<=0&&f.firstInsolvent===null){f.firstInsolvent=q;addEvent(s,'bad',f.name+'模型净资产转负','净资产与支付缺口是两条独立条件，不把资本支出或股价跌幅直接当亏损。');}
 f.last={ocf:OCF,capex,interest:extra,due,newDebt,shortfall:gap,netIncome:ni,saleCash};f.cumLoss+=loss;
 return {loss,principal,capex,aiCap};
}
function setPolicy(state,policy){const s=clone(state),p=normalize(policy,POLICY_FIELDS);if(JSON.stringify(p)!==JSON.stringify(s.policy)){s.policy=p;s.policyHistory.push({q:s.q,policy:clone(p)});}return s;}
function step(state,policy){
 const s=clone(state);if(s.q>=MAX_MONTHS)return s;
 if(policy){const p=normalize(policy,POLICY_FIELDS);if(JSON.stringify(p)!==JSON.stringify(s.policy)){s.policy=p;s.policyHistory.push({q:s.q,policy:clone(p)});}}
 s.q++;const q=s.q,c=s.config,p=s.policy,m=DATA.macro,stress=envelope(q,c),ret=1-(1-c.aiReturn)*stress;
 const yBase=m.gdp*Math.pow(1.04,q/12),trend=Math.pow(1.1,Math.min(q,48)/12),roll=clamp(1-c.fundingFreeze*stress*(1-.75*p.liquidity)-s.creditGap*.5,0,1);
 const remainingBudget=Math.max(0,.4*yBase-s.publicDebt),budget={left:Math.min(remainingBudget,yBase*.10/12)};
 const take=amount=>{const v=Math.min(budget.left,Math.max(0,amount));budget.left-=v;return v;};
 const fiscalInterest=Math.max(0,s.publicDebt)*(.025+.03*Math.max(0,s.publicDebt/yBase-.15))/12;
 const interestPaid=take(fiscalInterest);s.arrears+=fiscalInterest-interestPaid;
 const uOld=s.U/(s.E+s.U),trigger=clamp((uOld-m.unemployment)/.04+stress*.15,0,1);
 const transfers=take(p.transfers*yBase/12*trigger),training=take(p.training*yBase/12*(stress>0?1:.25));
 const aiPlan=c.aiInvestment*trend/12,aiActual=aiPlan*(1-.6*p.capexCut)*(1-.65*s.creditGap)*(.75+.25*roll);
 const actualInvestment=Math.max(0,aiActual);s.investment=actualInvestment;s.cumInvestment+=actualInvestment;
 const adoptRate=monthRate(.025*(.35+.65*Math.sqrt(aiPlan>0?actualInvestment/aiPlan:0)),c.transmissionSpeed);
 const da=(1-s.adoption)*adoptRate;s.adoption+=da;
 let firmLoss=0,firmDefaults=0,firmAIInvestment=0;
 const investmentFactor=aiPlan>0?actualInvestment/aiPlan:0;
 for(const f of s.firms){const v=firmStep(f,s,{c,p,stress,roll,ret,trend,investmentFactor});firmLoss+=v.loss;firmDefaults+=v.principal;firmAIInvestment+=v.aiCap;}
 // Distinct debt buckets: named firms, other AI projects, LGFVs, remaining loans.
 const aiHaz=monthRate(clamp(stress*Math.max(0,1-ret)*.012+(1-roll)*.025+Math.max(0,-s.gap)*.02,0,.25),c.transmissionSpeed);
 const lgHaz=monthRate(clamp(c.landLoss*stress*.012+(1-roll)*.018+Math.max(0,-s.gap)*.015,0,.25),c.transmissionSpeed);
 const aiDef=s.aiDebt*aiHaz,lgDef=s.lgfvDebt*lgHaz,aiLGD=.4+.25*stress,lgLGD=.4+.15*stress;
 const aiLoss=aiDef*aiLGD,lgLoss=lgDef*lgLGD;
 const aiNew=Math.max(0,actualInvestment-firmAIInvestment)*.45*(1-p.debtLimit)*roll;
 const lgNew=s.lgfvDebt*(Math.pow(1.006,1/3)-1)*roll;
 s.aiDebt=Math.max(0,s.aiDebt-aiDef+aiNew);s.lgfvDebt=Math.max(0,s.lgfvDebt-lgDef+lgNew);
 const plannedOther=q>=c.shockStart?Math.min(c.otherLoss/c.lossWindow,s.otherShockRemaining):0;
 const inducedOther=s.otherLoans*.6*monthRate(Math.max(0,-s.gap)*.004/.6,c.transmissionSpeed);
 const otherLoss=Math.min(s.otherLoans*.6,plannedOther+inducedOther),otherDef=otherLoss/.6;
 const externalOtherLoss=Math.min(plannedOther,otherLoss);
 s.otherShockRemaining=Math.max(0,s.otherShockRemaining-externalOtherLoss);s.otherExogenousLoss+=externalOtherLoss;
 const otherGrowth=s.otherLoans*(.03/12*(1-s.creditGap)-s.creditGap*monthRate(.025,c.transmissionSpeed));
 s.otherLoans=Math.max(0,s.otherLoans-otherDef+otherGrowth);
 s.firmLoans=sum(s.firms.filter(f=>f.alive).map(f=>f.debt))*.55;
 const lgGuarantee=take(lgLoss*.08*(p.localAid/POLICY_FIELDS.localAid.max));
 const bankLoss=aiLoss*.65+lgLoss*.55+otherLoss+firmLoss*.55-lgGuarantee;
 s.losses.ai+=aiLoss;s.losses.lgfv+=lgLoss;s.losses.other+=otherLoss;s.losses.firms+=firmLoss;
 s.creditLosses+=aiLoss+lgLoss+otherLoss+firmLoss;s.bankLosses+=bankLoss;s.publicGuarantees+=lgGuarantee;
 s.totalDefaulted+=aiDef+lgDef+otherDef+firmDefaults;s.totalNewLending+=aiNew+lgNew+Math.max(0,otherGrowth);
 s.loans=s.otherLoans+s.firmLoans+s.aiDebt*.65+s.lgfvDebt*.55;
 const profit=m.bankProfitHalfYear/6*.6*Math.exp(1.5*s.gap)*(1-.4*s.creditGap);
 s.bankCapital+=profit-bankLoss;
 s.bankRWA=c.bankRWA*(s.loans/m.loans)*(1+.05*c.fundingFreeze*stress);
 const recap=take(Math.min(p.recap/12,Math.max(0,s.bankRWA*.12-s.bankCapital)));
 s.bankCapital+=recap;s.publicAssets+=recap;
 s.car=s.bankCapital/Math.max(.01,s.bankRWA);
 const capitalGap=clamp(1-s.car/.12,0,1);
 s.creditGap=clamp(.8*capitalGap+.12*c.fundingFreeze*stress*(1-p.liquidity*.8),0,.98);
 // Fiscal shortfall is incremental relative to baseline, not total fiscal deficit.
 const taxLoss=m.localRevenue*Math.max(0,1-Math.exp(s.gap))/12;
 const landNetLoss=m.landRevenue*c.landLoss*stress*.4/12;
 const extraLocalInterest=Math.max(0,s.localDebt-m.localDebt)*m.localRate/12;
 const localShortfall=taxLoss+landNetLoss+extraLocalInterest;
 const localAid=take(Math.min(p.localAid/12,localShortfall));
 const residual=Math.max(0,localShortfall-localAid),localBorrow=residual*(.35+.55*p.liquidity);
 s.localDebt+=localBorrow;
 const spendingCut=residual-localBorrow;
 s.localCut=clamp(spendingCut/(m.localRevenue/12),0,1);s.localPressure=localShortfall;
 const spending=interestPaid+transfers+training+lgGuarantee+recap+localAid;
 s.publicDebt+=spending;s.publicOutlays+=spending;
 // Venture equity is NOT bank lending. Each cohort's remaining invested principal can be lost only once.
 const vcTrend=Math.pow(1+c.vcGrowth,Math.min(q,48)/12);
 const vcNew=c.vcAnnual/12*vcTrend*Math.max(.05,roll)*(1-p.capexCut*.6)*(1-s.creditGap);
 const vcFail=monthRate(clamp(stress*Math.max(0,1-ret)*.04+(1-roll)*.04,0,.4),c.transmissionSpeed),vcLoss=s.vcOutstanding*vcFail;
 s.vcOutstanding+=vcNew-vcLoss;s.vcCumulative+=vcNew;s.vcLoss+=vcLoss;
 // Fixed population 100, with unemployment exits explicitly retained in N.
 const grossAI=s.E*.35*c.replacement*da,cyclical=s.E*monthRate(Math.max(0,-s.gap)*.003+s.creditGap*.003+s.localCut*.003,c.transmissionSpeed);
 const separations=Math.min(s.E,s.E*monthRate(.006)+grossAI+cyclical);
 let E=s.E-separations,U=s.U+separations,N=s.N;
 const trainLag=q>c.trainingLag?(s.history[q-c.trainingLag]?.training||0):0;
 const trainHiring=Math.min(U,trainLag/(yBase*.5/100)*.25);
 const organic=U*monthRate(.11)*Math.exp(s.gap*2)*(1-.65*s.creditGap);
 const aiCreated=grossAI*c.newJobs;
 const hires=Math.min(U,organic+aiCreated+trainHiring);E+=hires;U-=hires;
 const exits=Math.max(0,U-s.U0)*monthRate(.018,c.transmissionSpeed),reentry=Math.min(Math.max(0,N-s.N0),Math.max(0,N-s.N0)*monthRate(.025)+trainHiring*.1);
 U+=reentry-exits;N+=exits-reentry;
 s.E=E;s.U=U;s.N=N;s.displaced+=grossAI;s.createdJobs+=Math.min(aiCreated,hires);
 s.hours=clamp(1+Math.min(0,s.gap)*.20-s.creditGap*.035,.4,1.1);
 const wageFactor=E/s.E0*s.hours*Math.exp(.15*s.gap);
 const shiftedIncome=Math.min(.15,Math.max(0,s.displaced-s.createdJobs)/s.E0)*.5;
 const redistributionRecovery=shiftedIncome*c.highMPC;
 s.consumption=Math.max(.05,1+(.5*.85*(wageFactor-1)+redistributionRecovery+transfers*12/yBase*.9)/.55);
 s.scar=Math.max(0,s.scar*Math.pow(.997,1/3)+Math.max(0,U/(E+U)-m.unemployment)*.0005/3);
 const external=-.16*c.exportLoss*stress;
 const consumption=.55*(s.consumption-1);
 const investment=1.2*(actualInvestment-aiPlan)*12/yBase;
 const fiscal=-spendingCut*12/yBase+training*12/yBase;
 const credit=-.12*s.creditGap;
 const productivity=(s.adoption-.05)*Math.max(0,ret)*.035;
 const target=external+consumption+investment+fiscal+credit+productivity-s.scar;
 const noise=(random(c.seed,q)-.5)*.0003*stress/Math.sqrt(3);
 const monthlyPersistence=Math.pow(c.persistence,c.transmissionSpeed/3);
 s.gap=monthlyPersistence*s.gap+(1-monthlyPersistence)*target+noise;
 s.gdpIndex=100*Math.pow(1.04,q/12)*Math.exp(s.gap);
 const previousYear=q>=12?s.history[q-12].gdp:100/Math.pow(1.04,(12-q)/12);
 s.gdpGrowth=s.gdpIndex/previousYear-1;
 s.productivity=productivity;
 s.stockIndex=100*Math.exp(2*s.gap-.4*c.fundingFreeze*stress-.25*(1-ret)*stress);
 s.peakJobless=Math.max(s.peakJobless,s.U/(s.E+s.U));
 s.last={external,consumption,investment,fiscal,credit,productivity,loss:bankLoss,recap,transfers,training,localAid,guarantee:lgGuarantee,bankProfit:profit,unfunded:fiscalInterest-interestPaid,stress,roll,ret,aiLoss,lgLoss,otherLoss,vcNew,vcLoss,spendingCut,localBorrow,firmAIInvestment,externalOtherLoss,adoptRate,monthlyPersistence,trainHiring,aiPlan};
 if(q===c.shockStart)addEvent(s,'warn','外部冲击开始','需求、融资与资产回收同时变化；政策从实际传导改变结果，不直接修改曲线。');
 if(s.history.at(-1).car>=12&&s.car<.12)addEvent(s,'bad','银行资本低于模型目标','资本比率降到'+(s.car*100).toFixed(1)+'%；信用供给开始受到资本约束。12%是模型目标，不是统一法定标准。');
 if(s.bankCapital<0&&s.history.at(-1).car>=0)addEvent(s,'bad','极端压力：模型银行资本耗尽','这是给定敞口和损失的条件结果；需要更大注资或重组。当前版本不模拟存款挤兑和货币危机。');
 if(s.history.at(-1).unemployment<10&&s.U/(s.E+s.U)>=.1)addEvent(s,'bad','合成样本失业率超过10%','消费与招聘形成持续反馈；同时观察就业人口比，避免退出求职掩盖问题。');
 if(recap>.001)addEvent(s,'policy','银行资本补充',(recap).toFixed(2)+'万亿元实际拨付，同时计入公共融资及持有的金融资产。');
 if(q===c.shockStart+c.shockRamp-1)addEvent(s,'warn','设定冲击达到峰值','这是外生压力达到设定强度，不表示经济低谷或公司破产发生在本月。');
 if(q%12===0)addEvent(s,'info','年度观察','产出较无冲击基线'+((Math.exp(s.gap)-1)*100).toFixed(1)+'%，就业人口比'+s.E.toFixed(1)+'%，累计新增公共融资'+s.publicDebt.toFixed(1)+'万亿元。');
 s.history.push({...snapshot(s),training});
 const errors=audit(s);if(errors.length)throw new Error(errors.join('; '));
 return s;
}
function audit(s){
 const e=[];if(Math.abs(s.E+s.U+s.N-100)>1e-7)e.push('人口恒等式错误');
 if(Math.min(s.E,s.U,s.N)<-1e-8)e.push('负人口');
 for(const f of s.firms){const a=f.cash+f.aiK+f.otherA,l=f.debt+f.otherL+f.mezz+f.equity;if(Math.abs(a-l)>1e-7)e.push(f.name+'资产负债不平');if(f.cash<-.000001||f.debt<-.000001||f.aiK<-.000001||f.otherA<-.000001||f.otherL<-.000001)e.push(f.name+'资产债务负值');}
 if(s.otherExogenousLoss>s.config.otherLoss+1e-8)e.push('外生损失重复计入');
 if(s.vcLoss>s.vcCumulative+1e-8)e.push('股权损失超过已投本金');
 if(Math.abs(s.creditLosses-sum(Object.values(s.losses)))>1e-7)e.push('损失重复计数');
 const walk=(x,path)=>{if(typeof x==='number'&&!Number.isFinite(x))e.push('非有限值:'+path);else if(x&&typeof x==='object')for(const [k,v] of Object.entries(x))if(k!=='history')walk(v,path+'.'+k);};walk(s,'state');return e;
}
function run(config,policy,months=36){let s=create(config,policy);for(let i=0;i<clamp(months,0,MAX_MONTHS);i++)s=step(s);return s;}
function metrics(s){
 const h=s.history,gaps=h.map(x=>x.gap),worst=Math.min(...gaps),trough=gaps.indexOf(worst);let recovered=null;
 for(let i=trough+1;i<=h.length-12;i++){if(h.slice(i,i+12).every(x=>x.gap> -1)){recovered=i;break;}}
 const firstBank=h.find(x=>x.car<12)?.q??null,firstCash=s.firms.reduce((m,f)=>f.firstGap===null?m:m===null?f.firstGap:Math.min(m,f.firstGap),null);
 return {gdpGap:h.at(-1).gap,worstGap:worst,peakUnemployment:Math.max(...h.map(x=>x.unemployment)),employment:s.E,creditLoss:s.creditLosses,bankLoss:s.bankLosses,publicDebt:s.publicDebt,publicAssets:s.publicAssets,localDebt:s.localDebt,adoption:s.adoption*100,companiesInGap:s.firms.filter(f=>!f.alive).length,recovery:worst> -1?0:recovered===null?null:(recovered-trough)/12,firstBank,firstCash,troughMonth:trough};
}
function compare(config,months=36){return Object.entries(PRESETS).map(([id,p])=>{const state=run(config,policyFor(id),months);return {id,name:p.name,state,metrics:metrics(state)};});}
function compareSpeeds(config,policy,months=36){return [1,3,6].map(speed=>{const state=run({...config,transmissionSpeed:speed},policy,months);return {speed,state,metrics:metrics(state)};});}
function exportGame(s){return {schema:'china-stress-save',version:VERSION,timeUnit:'month',config:s.config,initialPolicy:s.initialPolicy,policyHistory:s.policyHistory,month:s.q};}
function importGame(raw){
 if(raw?.version==='cn-0.1.0')throw new Error('这是旧季度版存档。请在旧版页面打开；不能把季度记录直接当成月份。');
 if(!raw||raw.schema!=='china-stress-save'||raw.version!==VERSION||raw.timeUnit!=='month'||!Number.isInteger(raw.month)||raw.month<0||raw.month>MAX_MONTHS)throw new Error('月度存档格式或版本不匹配');
 let s=create(raw.config,raw.initialPolicy);const schedule=Array.isArray(raw.policyHistory)?raw.policyHistory:[];
 for(let month=0;month<raw.month;month++){const a=schedule.filter(x=>x&&x.q===month).at(-1);s=step(s,a?.policy);}
 const current=schedule.filter(x=>x&&x.q===raw.month).at(-1);if(current)s=setPolicy(s,current.policy);return s;
}
return {VERSION,PERIODS_PER_YEAR,MAX_MONTHS,monthRate,annualFlow,initialMaturities,envelope,compareSpeeds,DATA,CONFIG_FIELDS,POLICY_FIELDS,PRESETS,SCENARIOS,configFor,policyFor,normalize,create,setPolicy,step,run,compare,audit,metrics,exportGame,importGame,date,clone};
});
