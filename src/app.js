(function () {
'use strict';
const RESEARCH=window.AIFinanceResearch;
const E=window.AIFinance,$=id=>document.getElementById(id),fmt=(x,d=1)=>x===null||x===undefined?'—':Number(x).toFixed(d),esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors={teal:'#4cd8bf',blue:'#77acff',orange:'#f7b56a',red:'#ff7e95',purple:'#bd9cff',gray:'#71869f'};
let world,control,branch=null,selectedNode='cloud',pendingLate=false,toastTimer;
let playing=false,playTimer=null,pauseAt=48,milestonePaused=false;
const ART=window.AIFinanceArt;
const portraitCache={};
async function preparePortraits(){
 const image=new Image();image.src=ART.dataUri;await image.decode();
 const [cw,ch]=ART.cell;
 if(image.naturalWidth!==cw*5||image.naturalHeight!==ch*4)throw Error('角色素材尺寸不匹配');
 for(let row=0;row<4;row++)for(let col=0;col<5;col++){
  const canvas=document.createElement('canvas');canvas.width=cw;canvas.height=ch;
  canvas.getContext('2d').drawImage(image,col*cw,row*ch,cw,ch,0,0,cw,ch);
  portraitCache[col+':'+row]=canvas.toDataURL('image/png');
 }
}
const laborFields=[['automationCeiling','原岗位可替代上限',0,1,.05],['newJobsOffset','新增岗位补回比例',0,1.5,.05],['transitionSpeed','每季替代推进速度',0,1,.01],['exitRate','失业者每季退出求职比例',0,1,.01],['hoursReduction','完全替代时平均工时缩短',0,1,.05]];
let importedLaborConfig=null;

const fields=[
 ['capexPace','企业投资节奏（协调情景）',.2,1.4,.05,x=>fmt(x*100,0)+'%'],
 ['ltv','新增资产贷款抵押比例上限',.2,.95,.05,x=>fmt(x*100,0)+'%'],
 ['capitalTarget','银行权益 / 资产目标',.04,.25,.005,x=>fmt(x*100,1)+'%'],
 ['concentration','银行 AI 贷款 / 净资产上限',.3,4,.1,x=>fmt(x,1)+'×'],
 ['guaranteeLimit','新增供应商担保限额系数',0,1,.1,x=>fmt(x*100,0)+'%'],
 ['liquidityLine','央行独立获批流动性额度',0,200,10,x=>'$'+fmt(x,0)+'B'],
 ['recapBudget','财政股权注资预算',0,200,10,x=>'$'+fmt(x,0)+'B'],
 ['workerSupport','每季就业支持（累计上限48）',0,8,.5,x=>'$'+fmt(x,1)+'B'],
 ['approvalLag','财政审批延迟',0,4,1,x=>fmt(x,0)+' 季'],
 ['bufferRelease','危机时释放监管缓冲',0,.06,.005,x=>fmt(x*100,1)+' 个百分点']
];
function toast(msg){$('toast').textContent=msg;$('toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.display='none',3800);}
function guard(fn){try{$('error').style.display='none';fn();return true;}catch(e){stopPlayback();console.error(e);window.__reportSandboxError(e.message);return false;}}
function updateRuntime(){
  if(!world)return;
  let valid=true;try{valid=Boolean(E.auditWorld(world).ok);}catch(_){valid=false;}
  $('runtimeStatus').className='runtime-status '+(valid?'ready':'failed');
  $('runtimeText').textContent=(valid?'JS 已启动':'账务检查未通过')+' · Q'+world.quarter+' · '+(playing?'自动播放中':'已暂停，可点击下一季度')+' · v0.3.2';
  $('playBtn').textContent=playing?'暂停':milestonePaused?'继续自动播放':'自动播放';
  $('stepBtn').textContent=milestonePaused?'继续至 Q'+(world.quarter+1)+' →':'下一季度 →';
  $('playBtn').classList.toggle('playing',playing);
  $('playBtn').setAttribute('aria-pressed',String(playing));
  $('playBtn').disabled=false;
  $('runBtn').disabled=false;
}
function stopPlayback(){
  playing=false;
  if(playTimer!==null){clearTimeout(playTimer);playTimer=null;}
  if(world)updateRuntime();
}
function schedulePlayback(){
  if(!playing)return;
  const delay=Number($('playSpeed').value)||900;
  playTimer=setTimeout(function tick(){
    playTimer=null;
    if(!playing)return;
    if(!guard(()=>next()))return;
    if(!playing)return;
    schedulePlayback();
  },delay);
}
function togglePlayback(){
  if(playing){stopPlayback();return;}
  if(!world)return;
  resumeCheckpoint();
  playing=true;updateRuntime();
  if(!guard(()=>next()))return;
  if(!playing)return;
  schedulePlayback();
}
window.__pauseSandbox=stopPlayback;

function policyValues(){const p={...E.DEFAULT_POLICY,...(world?world.policy:{})};for(const [k]of fields)p[k]=Number($('p_'+k).value);return E.validatePolicy(p);}
function showPolicy(p){for(const [k,,,,,format]of fields){$('p_'+k).value=p[k];$('v_'+k).textContent=format(p[k]);}}
function laborConfig(){const c={...E.Labor.DEFAULTS,...(importedLaborConfig||{})};for(const [k] of laborFields)c[k]=Number($('l_'+k).value);return E.Labor.validate(c);}
function showLabor(c){for(const [k]of laborFields){$('l_'+k).value=c[k];$('lv_'+k).textContent=fmt(c[k]*100,0)+'%';}}
function timingValues(){return E.validateTiming({shockStart:Number($('shockStart').value),rampQuarters:Number($('rampQuarters').value)});}
function showTiming(t){$('shockStart').value=t.shockStart;$('rampQuarters').value=t.rampQuarters;}
function config(){return {timing:timingValues(),laborConfig:laborConfig(),scenario:$('scenario').value,severity:Number($('severity').value),seed:Number($('seed').value),bankBuffer:Number($('bankBuffer').value)};}
function showInputLabels(){ $('severityVal').textContent=fmt(Number($('severity').value),1)+'×';$('bankBufferVal').textContent=fmt(Number($('bankBuffer').value)*100,1)+'%';$('scenarioHelp').textContent=E.SCENARIOS[$('scenario').value].description; }
function reset(){stopPlayback();pauseAt=48;milestonePaused=false;const opts=config(),p=policyValues();pendingLate=$('preset').value==='late';world=E.createWorld({...opts,policy:pendingLate?E.DEFAULT_POLICY:p});control=E.createWorld({...opts,policy:E.DEFAULT_POLICY});showInputLabels();render();}
function savedRun(){const data=E.exportRun(world);data.ui={pendingLate,preset:$('preset').value,moodPreview:$('moodPreview').value,characterOverrides:{...characterOverrides}};return data;}
function restoreRun(data){
  stopPlayback();
  world=E.replay(data);showTiming(world.timing);milestonePaused=world.quarter>0&&world.quarter%48===0;pauseAt=milestonePaused?world.quarter:48*(Math.floor(world.quarter/48)+1);Object.keys(characterOverrides).forEach(k=>delete characterOverrides[k]);for(const [k,v] of Object.entries(data.ui&&data.ui.characterOverrides||{})){if(CAST.some(c=>c.id===k)&&MOODS[v])characterOverrides[k]=v;}$('moodPreview').value=data.ui&&MOODS[data.ui.moodPreview]?data.ui.moodPreview:'auto';importedLaborConfig={...world.labor.config};showLabor(world.labor.config);
  control=E.run({...data.config,policy:E.DEFAULT_POLICY,quarters:world.quarter});
  for(const k of ['scenario','severity','seed','bankBuffer'])$(k).value=world[k];
  pendingLate=Boolean(data.ui&&data.ui.pendingLate&&world.quarter<world.timing.shockStart);
  $('preset').value=data.ui&&E.PRESETS[data.ui.preset]?data.ui.preset:'market';
  showInputLabels();showPolicy(pendingLate?E.PRESETS.late.policy:world.policy);render();
}
function resumeCheckpoint(){
 if(world&&world.quarter>=pauseAt)pauseAt=48*(Math.floor(world.quarter/48)+1);
 milestonePaused=false;
}
function next(renderNow=true){
 resumeCheckpoint();
 if(pendingLate&&world.quarter===world.timing.shockStart-1){E.setPolicy(world,E.PRESETS.late.policy);pendingLate=false;}
 E.step(world);E.step(control);
 if(world.quarter===pauseAt){milestonePaused=true;stopPlayback();}
 if(renderNow){render();if(milestonePaused)toast('Q'+world.quarter+' 自动暂停；不是终点，点击继续即可。');}
}
function runTo(q){
 stopPlayback();if(!Number.isSafeInteger(q)||q<world.quarter)throw Error('无效目标季度');
 resumeCheckpoint();const target=Math.min(q,pauseAt);
 while(world.quarter<target)next(false);
 render();if(milestonePaused)toast('到达 Q'+world.quarter+' 检查点；可保存、改政策，再继续。');
}
function tab(id){document.querySelectorAll('.tab-panel').forEach(x=>x.classList.toggle('active',x.id===id));document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));}
function metric(label,value,sub,css=''){return `<section class="card metric"><div class="metric-label">${label}</div><div class="metric-value ${css}">${value}</div><div class="metric-sub">${sub}</div></section>`;}
function renderMetrics(){const h=world.history.at(-1),base=control.history.at(-1);$('metrics').innerHTML=
 metric('标普500',fmt(h.sp500),'模拟行业组合；初始100')+metric('纳斯达克',fmt(h.nasdaq),'模拟科技股组合；初始100')+metric('累计进入清算',h.defaults+' 家','其中银行 '+h.bankDefaults+' 家',h.bankDefaults?'bad':'')+metric('债权净本金减记','$'+fmt(h.cumulativeCreditLoss)+'B','担保及财团回款后的债权损失',h.cumulativeCreditLoss>0?'bad':'')+
 metric('GDP 指数',fmt(h.gdp),'原有规则 '+fmt(base.gdp),h.gdp<95?'bad':'')+metric('人类总工时',fmt(h.humanWorkIndex),'初始100；含工时缩短',h.humanWorkIndex<90?'bad':'')+metric('美元指数',fmt(h.dollar),'含避险与利差通道；示意')+metric('AI 技术进度',fmt(h.technology,2)+'×','技术增长不等于股东盈利','good');}
function chart(id,series,height=220,domain=null){const W=520,H=height,L=43,R=15,T=14,B=29;let vals=series.flatMap(s=>s.data.map(p=>p.v)).filter(v=>v!==null&&Number.isFinite(v));if(!vals.length)vals=[0,100];let min=Math.min(...vals),max=Math.max(...vals);if(max-min<.2){min-=.5;max+=.5;}const pad=(max-min)*.12;min-=pad;max+=pad;if(domain){min=domain[0];max=domain[1];}const end=Math.max(4,world.quarter);const x=q=>L+q/end*(W-L-R),y=v=>H-B-(v-min)/(max-min)*(H-T-B);let svg='';for(let i=0;i<5;i++){const v=min+(max-min)*i/4,Y=y(v);svg+=`<line x1="${L}" x2="${W-R}" y1="${Y}" y2="${Y}" stroke="#2a4057"/><text x="${L-8}" y="${Y+4}" text-anchor="end" font-size="10" fill="#90a6bf">${fmt(v,Math.abs(max-min)<10?1:0)}</text>`;}for(let i=0;i<=4;i++){const q=Math.round(end*i/4),X=x(q);svg+=`<text x="${X}" y="${H-8}" text-anchor="middle" font-size="10" fill="#90a6bf">Q${q}</text>`;}if(end>=world.timing.shockStart)svg+=`<line x1="${x(world.timing.shockStart)}" x2="${x(world.timing.shockStart)}" y1="${T}" y2="${H-B}" stroke="#50637a" stroke-dasharray="3 5"/>`;for(const s of series){const valid=s.data.filter(p=>p.v!==null&&Number.isFinite(p.v));if(!valid.length)continue;const pts=valid.map(p=>`${x(p.q)},${y(p.v)}`).join(' ');svg+=`<polyline fill="none" stroke="${s.color}" stroke-width="${s.dash?1.5:2.5}" ${s.dash?'stroke-dasharray="5 4"':''} points="${pts}"/>`;const last=valid.at(-1);svg+=`<circle cx="${x(last.q)}" cy="${y(last.v)}" r="${s.dash?2:3}" fill="${s.color}"/>`;}$(id).setAttribute('viewBox',`0 0 ${W} ${H}`);$(id).innerHTML=svg;}
function line(key,color,base=false){return {data:(base?control:world).history.map(h=>({q:h.quarter,v:h[key]})),color,dash:base};}
const positions={domestic:[95,70],foreign:[95,200],fed:[95,330],gov:[95,445],bankA:[335,90],bankB:[335,230],credit:[335,380],hyper:[590,70],cloud:[590,245],legacy:[590,420],labA:[850,80],labB:[850,220],chip:[850,390]};
function renderNetwork(){let s='<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#8ca2ac"/></marker></defs>';
const groups={};for(const l of [...world.initialLoans,...world.loans]){const k=l.lender+'|'+l.borrower;if(!groups[k])groups[k]={from:l.lender,to:l.borrower,amount:0};}for(const l of world.loans)groups[l.lender+'|'+l.borrower].amount+=l.principal;
function edge(a,b,color,width,dash,opacity,title){const A=positions[a],B=positions[b];if(!A||!B||a===b)return;const dx=B[0]-A[0],dy=B[1]-A[1],dist=Math.hypot(dx,dy),sx=A[0]+dx/dist*62,sy=A[1]+dy/dist*24,ex=B[0]-dx/dist*64,ey=B[1]-dy/dist*25;const bend=Math.abs(dy)>180?24:9;return `<path d="M${sx},${sy} Q${(sx+ex)/2+bend},${(sy+ey)/2-bend} ${ex},${ey}" fill="none" stroke="${color}" stroke-width="${width}" opacity="${opacity}" ${dash?`stroke-dasharray="${dash}"`:''} marker-end="url(#arr)"><title>${esc(title)}</title></path>`;}
for(const e of Object.values(groups))s+=edge(e.from,e.to,'#8ca2ac',Math.min(5,.8+Math.sqrt(e.amount)/8),'',e.amount>0?.48:.1,`${E.REPRESENTATIVES[e.from].name} → ${E.REPRESENTATIVES[e.to].name}: $${fmt(e.amount)}B`)||'';
for(const c of world.contracts){const active=world.quarter<=c.end&&world.nodes.every(n=>![c.payer,c.payee].includes(n.id)||!n.closed);s+=edge(c.payer,c.payee,colors.teal,1.5,'6 5',active?.6:.1,`每季算力款 $${c.quarterly}B（不是已借入债务）`)||'';}
for(const g of world.guarantees){const l=world.loans.find(l=>l.id===g.loanId)||world.initialLoans.find(l=>l.id===g.loanId);if(l)s+=edge(g.guarantor,l.lender,colors.purple,1.5,'2 4',g.remaining>0?.65:.12,`剩余担保上限 $${fmt(g.remaining)}B`)||'';}
for(const n of world.history.at(-1).nodes){const [x,y]=positions[n.id],c=n.closed?colors.red:n.kind==='bank'?colors.blue:n.kind==='government'||n.kind==='centralbank'?colors.purple:colors.teal;const selected=n.id===selectedNode;s+=`<g class="node" data-node="${n.id}" tabindex="0" role="button" aria-label="${esc(n.name)}"><title>${esc(n.name+" · "+n.group+"；情景群体，非真实公司账目")}</title><rect x="${x-76}" y="${y-24}" width="152" height="49" rx="8" fill="${n.closed?'#3b2331':'#102239'}" stroke="${selected?c:'#3c5673'}" stroke-width="${selected?2:1}"/><text x="${x}" y="${y-3}" text-anchor="middle" font-size="${n.name.length>13?10:12}" fill="${c}" font-weight="650">${esc(n.name)}</text><text x="${x}" y="${y+14}" text-anchor="middle" font-size="10" fill="#a3b8d0">${n.closed?'已进入清算':'现金 '+fmt(n.cash)+' · 净资产 '+fmt(n.equity)}</text></g>`;}
$('networkGraph').innerHTML=s;$('networkGraph').querySelectorAll('[data-node]').forEach(el=>{el.onclick=()=>{selectedNode=el.dataset.node;renderNetwork();renderDetail();};el.onkeydown=e=>{if(e.key==='Enter')el.onclick();};});renderDetail();}
function renderDetail(){const n=world.history.at(-1).nodes.find(n=>n.id===selectedNode);const lenders=world.loans.filter(l=>l.borrower===n.id).map(l=>`${world.nodes.find(x=>x.id===l.lender).name} $${fmt(l.principal)}B`);const commitments=world.contracts.filter(c=>c.payer===n.id).reduce((s,c)=>s+c.quarterly*Math.max(0,c.end-Math.max(world.quarter,c.start-1)),0);const actor=CAST.find(c=>c.node===n.id);$('nodeDetail').innerHTML=(actor?portrait(actor,characterState(actor).mood,'detail-portrait'):'')+`<strong>${esc(n.name)}</strong><span class="group-label">${esc(n.group)}</span> <span class="muted">${n.closed?'已清算；历史合同不代表仍需全额履行':'模型状态'}</span><br>现金 $${fmt(n.cash)}B · 资产 $${fmt(n.assets)}B · 债务 $${fmt(n.debt)}B · 净资产 $${fmt(n.equity)}B<br>债权人：${esc(lenders.join('；')||'无未偿借款')}<br><span class="muted">原始算力合同剩余名义付款 $${fmt(commitments)}B（不含在上述债务；违约可改变履约状态）。</span>`;}
function render(){const h=world.history.at(-1);$('quarter').innerHTML=`Q${world.quarter} <span>${world.quarter===0?'初始状态':'已过 '+fmt(world.quarter/4,2)+' 年'}</span>`;renderCast();renderLabor();renderMetrics();chart('priceChart',[line('sp500',colors.teal),line('nasdaq',colors.blue),line('gpuPrice',colors.orange)]);chart('rateChart',[line('treasuryYield',colors.teal),line('policyRate',colors.blue),line('spread',colors.red)]);chart('gdpChart',[line('gdp',colors.gray,true),line('gdp',colors.teal)],190);chart('jobsChart',[line('nonEmploymentRate',colors.orange),line('unemployment',colors.red)],190,[0,100]);renderNetwork();$('balanceTable').innerHTML=h.nodes.map(n=>`<tr><td>${esc(n.name)}<small class="table-group">${esc(n.group)}</small></td><td>${fmt(n.cash)}</td><td>${fmt(n.assets)}</td><td>${fmt(n.debt)}</td><td style="color:${n.equity<0?colors.red:'inherit'}">${fmt(n.equity)}</td><td><span class="status ${n.closed?'bad':''}">${n.closed?'已清算':'存续'}</span></td></tr>`).join('');
const ev=world.events.slice().reverse();$('events').innerHTML=ev.length?ev.map(e=>`<div class="event ${e.type}"><span class="q">Q${e.quarter}</span><span>${esc(e.text)}${e.amount>0?' <strong>$'+fmt(e.amount)+'B</strong>':''}</span></div>`).join(''):'<p class="muted small">尚无事件。推进季度，或点击“一键完整演示”。</p>';
$('publicCost').innerHTML=`<table><tbody><tr><td>财政累计股权注资</td><td>$${fmt(h.recapSpent)}B</td></tr><tr><td>政府持有股权的模型市值</td><td>$${fmt(h.govEquityValue)}B</td></tr><tr><td>累计就业支持支出</td><td>$${fmt(h.workerSpent)}B</td></tr><tr><td>本模型财政新增债务</td><td>$${fmt(h.govDebt)}B</td></tr><tr><td>央行贷款未偿本金</td><td>$${fmt(h.liquidityOutstanding)}B</td></tr><tr><td>央行贷款已发生本金损失</td><td>$${fmt(h.liquidityLoss)}B</td></tr><tr><td>海外投资者总资产</td><td>$${fmt(h.foreignWealth)}B</td></tr></tbody></table>`;
const a=E.auditWorld(world);$('audit').innerHTML=`现金边界误差：${a.cashError.toExponential(2)}<br>债权 / 债务镜像误差：${a.loanMirrorError.toExponential(2)}<br>主清算最大残差：${a.clearingResidual.toExponential(2)}<br>人口守恒误差：${a.laborPopulationError.toExponential(2)}<br>已检查季度：${world.audit.length} / ${world.quarter}<br><strong>${a.ok?'账务与数值检查通过':'检查未通过'}</strong><br><span class="muted">数值通过 ≠ 现实预测有效。</span>`;$('stepBtn').disabled=false;$('runBtn').textContent=world.quarter<16?'运行至 Q16':'再运行 4 季';window.__sandbox={world,control,engine:E,uiVersion:'0.3.2',isPlaying:()=>playing,render,characterState};renderExtras();updateRuntime();}
function compare(){stopPlayback();const rows=E.compare({...actualConfig(),quarters:16});$('comparisonResult').className='';$('comparisonResult').innerHTML=`<div class="table-wrap"><table><thead><tr><th>政策</th><th>清算 / 银行</th><th>债权净减记 $B</th><th>GDP</th><th>最低就业人口比</th><th>最高未就业占比</th><th>求职失业峰值</th><th>总工时</th><th>AI 技术</th><th>注资＋就业支出 $B</th></tr></thead><tbody>${rows.map(r=>{const x=r.summary;return `<tr><td>${esc(r.label)}</td><td>${x.defaults} / ${x.bankDefaults}</td><td>${fmt(x.netCreditLoss)}</td><td>${fmt(x.gdp)}</td><td>${fmt(x.minEmploymentRate)}%</td><td>${fmt(x.peakNonEmploymentRate)}%</td><td>${fmt(x.peakUnemployment)}%</td><td>${fmt(x.humanWorkIndex)}</td><td>${fmt(x.technology,2)}×</td><td>${fmt(x.recapSpent+x.workerSpent)}</td></tr>`;}).join('')}</tbody></table></div><p class="help">Q16 · 种子 ${world.seed} · 冲击 ${world.severity}× · 初始银行缓冲 ${fmt(world.bankBuffer*100)}%。危机中突然收紧方案在所选冲击开始季度生效；其他方案从 Q1 起实施。财政支出不是净财政损失，担保人的损失也不包括在债权净减记中。</p>`;tab('comparison');$('comparison').scrollIntoView({block:'start',behavior:'smooth'});toast('六组同情景对照已完成。');}
function stress(){stopPlayback();const r=E.stressGrid({...actualConfig(),policy:world.policy,quarters:16});$('stressResult').innerHTML=`<h3>有限网格压力扫描</h3><div class="callout">冲击强度 0.0 至 1.5，步长 0.1，共 16 条路径。<br>${r.firstBreached===null?'测试范围内没有出现银行清算。不能据此推断更强冲击或遗漏机制也安全。':'首个出现银行清算的测试点：'+r.firstBreached.toFixed(1)+'×。这不是精确阈值，也不是发生概率。'}</div><div class="table-wrap"><table><thead><tr><th>冲击</th><th>清算主体</th><th>银行清算</th><th>净减记 $B</th><th>GDP</th></tr></thead><tbody>${r.results.map(x=>`<tr><td>${fmt(x.severity)}</td><td>${x.defaults}</td><td>${x.bankDefaults}</td><td>${fmt(x.netCreditLoss)}</td><td>${fmt(x.gdp)}</td></tr>`).join('')}</tbody></table></div>`;tab('comparison');$('comparison').scrollIntoView({block:'start',behavior:'smooth'});toast('16 条路径扫描完成；不代表全扰动覆盖。');}
function demo(){ showTiming(E.DEFAULT_TIMING);importedLaborConfig=null;showLabor(E.Labor.DEFAULTS);$('moodPreview').value='auto';$('scenario').value='disappointment';$('severity').value='1.5';$('bankBuffer').value='.04';$('seed').value=42;$('preset').value='market';showPolicy(E.PRESETS.market.policy);reset();while(world.quarter<6)next(false);E.setPolicy(world,E.PRESETS.stabilization.policy);showPolicy(E.PRESETS.stabilization.policy);$('preset').value='stabilization';while(world.quarter<16)next(false);render();tab('network');toast('完成 Q1–Q16：Q4 冲击，Q6 后引入干预，与不干预路径比较。');}
function download(name,text,type='application/json'){const blob=new Blob([text],{type}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),3000);}
const CAST=[
 {id:'deepseek',name:'DeepSeek',sub:'外部竞争观察员 · 不设美国债务',col:0,node:null,tint:'#dcefff'},
 {id:'openai',name:'OpenAI / GPT',sub:'前沿模型与应用企业',col:1,node:'labA',tint:'#eae7ff'},
 {id:'anthropic',name:'Anthropic / Claude',sub:'模型与企业服务公司',col:2,node:'labB',tint:'#ffe9d5'},
 {id:'grok',name:'xAI / Grok',sub:'行业观察员 · 未建独立财务主体',col:3,node:null,tint:'#f4dfd9'},
 {id:'gemini',name:'Google / Gemini',sub:'综合科技与云平台',col:4,node:'hyper',tint:'#e8e2ff'}
];
const MOODS={calm:{row:0,label:'平静'},happy:{row:1,label:'开心'},worried:{row:2,label:'蹙眉'},defeated:{row:3,label:'吃瘪'}};
function characterState(c){
 const h=world.history.at(-1);let mood='calm',reason='先看看下一季。',value='观察情景，不是公司预测';
 if(c.node){const n=h.nodes.find(x=>x.id===c.node),base=world.history[0].nodes.find(x=>x.id===c.node);const ratio=n.sharePrice/base.sharePrice;
  value='群体净资产 $'+fmt(n.equity)+'B';
  if(n.closed){mood='defeated';reason='本轮企业群体进入清算。';}
  else if(n.equity<=0||ratio<.55){mood='defeated';reason='这轮吃瘪了，先保住现金。';}
  else if(ratio<.85||n.cash<base.cash*.35){mood='worried';reason='融资在收紧，要少冒一点险。';}
  else if(ratio>1.08){mood='happy';reason='这季表现不错，但债还是要还。';}
 }else if(c.id==='deepseek'){
  value='算力价格指数 '+fmt(h.computePrice);if(world.scenario==='competition'&&world.quarter>=world.timing.shockStart){mood='happy';reason='模型更便宜，竞争也更激烈。';}
  else if(h.creditSupply<.45){mood='worried';reason='资金紧张，也会影响竞争者。';}
  else if(world.quarter>0&&h.technology>1.15){mood='happy';reason='技术在进步，关注采用速度。';}
 }else{
  value='纳斯达克 '+fmt(h.nasdaq);if(h.nasdaq<65){mood='defeated';reason='行业遇冷，这次笑不出来了。';}
  else if(h.nasdaq<85||h.nonEmploymentRate>50){mood='worried';reason='技术成功，不等于所有人受益。';}
  else if(h.nasdaq>110){mood='happy';reason='行业上涨，也别忘了现金流。';}
 }
 const preview=$('moodPreview').value!=='auto'?$('moodPreview').value:(characterOverrides[c.id]||'auto');if(preview!=='auto'){mood=preview;reason='表情预览：不改变财务和就业计算。';}
 return {mood,reason,value};
}
function portrait(c,mood,extra=''){
 const src=portraitCache[c.col+':'+MOODS[mood].row];
 return `<img class="portrait ${extra}" src="${src}" width="${ART.cell[0]}" height="${ART.cell[1]}" alt="${esc(c.name+' '+MOODS[mood].label)}" draggable="false">`;
}

function renderCast(){
 $('castGrid').innerHTML=CAST.map(c=>{const st=characterState(c);return `<button class="character-card mood-${st.mood}" data-character="${c.id}" data-mood="${st.mood}" aria-pressed="${c.node===selectedNode}" title="${esc(c.node?'点击查看企业群体账目':'情景观察员：未建立独立债务主体')}"><div class="portrait-stage" style="--tint:${c.tint}">${portrait(c,st.mood)}<span class="mood-badge">${MOODS[st.mood].label}</span></div><div class="character-copy"><div class="character-name">${c.name}</div><div class="character-role">${c.sub}</div><div class="character-reaction">${st.reason}</div><div class="character-value">${st.value}</div></div></button>`;}).join('');
 $('castGrid').querySelectorAll('[data-character]').forEach(el=>el.onclick=()=>{const c=CAST.find(c=>c.id===el.dataset.character);if(c.node){selectedNode=c.node;tab('network');renderNetwork();renderCast();$('nodeDetail').scrollIntoView({block:'center',behavior:'smooth'});}else toast(c.name+' 仅作观察员；作为行业观察角色，尚未单列财务账本。');});
}
function renderLabor(){
 const h=world.history.at(-1),f=world.history[0],last=world.history.at(-2)||f;
 const kpi=(label,v,formula,sub)=>`<div class="labor-kpi"><span class="label">${label}</span><strong>${fmt(v)}${v===null?'':'%'}</strong><div class="formula-text">${formula}</div><div class="small">${sub}</div></div>`;
 $('laborKpis').innerHTML=kpi('就业人口比',h.employmentRate,'就业人数 ÷ 适龄人口','初始 '+fmt(f.employmentRate)+'%')+kpi('未就业占比',h.nonEmploymentRate,'未就业人数 ÷ 适龄人口','含退出与未参与者')+kpi('劳动参与率',h.participationRate,'（就业＋求职失业）÷ 人口','不等于就业人数占比')+kpi('求职失业率',h.unemployment,'失业人数 ÷ 劳动力','分母不含退出者');
 const groups=[{name:'就业',v:h.employed,color:colors.teal},{name:'未就业，仍求职',v:h.unemployedPersons,color:colors.orange},{name:'退出或未参与',v:h.notInLaborForce,color:'#a6b3be'}];
 $('populationBar').innerHTML=groups.map(g=>`<span style="width:${g.v/h.workingAgePopulation*100}%;background:${g.color}" title="${g.name} ${fmt(g.v)} / 100"></span>`).join('');
 $('populationLegend').innerHTML=groups.map(g=>`<span><i style="background:${g.color}"></i>${g.name} ${fmt(g.v)} 人</span>`).join('')+'<span class="muted">合计 100 人</span>';
 const change=h.employmentRate-f.employmentRate;const trend=change>=0?'增加':'减少';
 const misleading=h.employmentRate<last.employmentRate-1e-6&&h.unemployment!==null&&last.unemployment!==null&&h.unemployment<last.unemployment-1e-6;
 $('laborNarrative').innerHTML=`相对 Q0，每 100 名适龄人口中，就业${trend} <strong>${fmt(Math.abs(change))} 人</strong>；人类总工时为初始的 <strong>${fmt(h.humanWorkIndex)}%</strong>。${misleading?'<br><strong>注意：本季就业继续减少，但求职失业率下降；退出求职者没有消失，而是转入灰色区域。</strong>':''}<br><span class="muted">未就业可能源于求学、照护、主动休息或被替代，不能把全部未就业都算成非自愿损失。图中没有统计未付酬家务劳动。</span>`;
 chart('laborRatioChart',[line('employmentRate',colors.gray,true),line('employmentRate',colors.teal),line('participationRate',colors.blue)],180,[0,100]);
 chart('humanWorkChart',[line('humanWorkIndex',colors.gray,true),line('employmentIndex',colors.blue),line('humanWorkIndex',colors.orange)],180,[0,Math.max(110,...world.history.map(x=>x.employmentIndex),...control.history.map(x=>x.humanWorkIndex))]);
}
function laborDemo(exitOnly){
 showTiming(E.DEFAULT_TIMING);stopPlayback();importedLaborConfig=null;showLabor({...E.Labor.DEFAULTS,automationCeiling:exitOnly?.85:.9,newJobsOffset:.1,exitRate:exitOnly?.65:.12,transitionSpeed:.22,hoursReduction:.25});
 $('scenario').value='displacement';$('severity').value='1';$('bankBuffer').value='.105';$('seed').value='42';$('preset').value='market';showPolicy(E.DEFAULT_POLICY);$('moodPreview').value='auto';reset();runTo(exitOnly?24:16);
 $('laborSection').scrollIntoView({block:'start',behavior:'smooth'});toast(exitOnly?'Q24：退出求职也纳入人口分母，不能只看求职失业率。':'Q16：90% 原岗位替代上限、10% 新岗位补回的极端假设；不是现实预测。');
}

// UI rewrite 0.3.0. Financial and labor engine remain at 0.2.0.
const characterOverrides={};
function renderCastV3(){
 const titles={deepseek:'DeepSeek',openai:'OpenAI',anthropic:'Anthropic',grok:'xAI / Grok',gemini:'Google / Gemini'};
 const roles={deepseek:'外部竞争观察员',openai:'前沿模型与应用企业',anthropic:'模型与企业服务公司',grok:'行业观察员',gemini:'综合科技与云平台'};
 const accents={deepseek:'#59abff',openai:'#c1afff',anthropic:'#f4af74',grok:'#dbad78',gemini:'#b392fa'};
 const h=world.history.at(-1),first=world.history[0];
 $('castGrid').innerHTML=CAST.map(c=>{
  const st=characterState(c);let label='模型指标',value=st.value;
  if(c.node){const n=h.nodes.find(x=>x.id===c.node),n0=first.nodes.find(x=>x.id===c.node);const index=n0.sharePrice?100*n.sharePrice/n0.sharePrice:0;label='股价指数 · 模拟';value=fmt(index);}
  else if(c.id==='deepseek'){label='算力价格指数';value=fmt(h.computePrice);}else {label='纳斯达克';value=fmt(h.nasdaq);}
  return `<article class="actor" data-mood="${st.mood}" style="--accent:${accents[c.id]}"><button class="character-card mood-${st.mood}" data-character="${c.id}" data-mood="${st.mood}" aria-pressed="${c.node===selectedNode}" title="${esc(c.node?'查看所代表企业群体的模拟账目':'观察员，没有独立债务账户')}"><div class="character-title"><span class="character-name">${titles[c.id]}</span><span class="mood-badge">${MOODS[st.mood].label}</span></div><div class="character-role">${roles[c.id]}</div><div class="portrait-stage" style="--tint:${accents[c.id]}">${portrait(c,st.mood)}</div><div class="character-copy"><div class="character-reaction">${esc(st.reason)}</div><div class="character-value"><span>${label}</span><b>${value}</b></div></div></button><div class="expression-bar">${Object.keys(MOODS).map(m=>`<button data-face="${c.id}:${m}" title="预览 ${titles[c.id]}：${MOODS[m].label}" aria-label="${titles[c.id]} ${MOODS[m].label}" aria-pressed="${characterOverrides[c.id]===m}">${portrait(c,m,'mini')}<span>${{calm:'平静',happy:'开心',worried:'蹙眉',defeated:'吃瘪'}[m]}</span></button>`).join('')}<button data-face="${c.id}:auto" aria-pressed="${!characterOverrides[c.id]}">跟随<br>模型</button></div></article>`;
 }).join('');
 $('castGrid').querySelectorAll('[data-character]').forEach(el=>el.onclick=()=>{const c=CAST.find(x=>x.id===el.dataset.character);if(c.node){selectedNode=c.node;tab('network');renderNetwork();renderCast();$('nodeDetail').scrollIntoView({block:'center',behavior:'smooth'});}else toast(c.name+' 是情景观察员，没有为它虚构公司财务数据。');});
 $('castGrid').querySelectorAll('[data-face]').forEach(el=>el.onclick=()=>{const [id,m]=el.dataset.face.split(':');$('moodPreview').value='auto';if(m==='auto')delete characterOverrides[id];else characterOverrides[id]=m;renderCast();renderDetail();});
}
renderCast=renderCastV3;
function actualConfig(){return E.exportRun(world).config;}
function policyStatus(){
 if(!world)return;
 const changed=fields.some(([k])=>Math.abs(Number($('p_'+k).value)-world.policy[k])>1e-8);
 $('policyStatus').className='policy-status'+(changed?' dirty':'');
 $('policyStatus').textContent=changed?'已修改，尚未应用；点击下方按钮才会改变后续季度。':`当前政策已记录 · Q${world.quarter} 后的决定`;
}
function renderExtras(){
 const h=world.history.at(-1);
 // Largest-remainder rounding preserves exactly 100 glyphs.
 const real=[h.employed,h.unemployedPersons,h.notInLaborForce].map(v=>100*v/h.workingAgePopulation);
 const counts=real.map(Math.floor);let rest=100-counts.reduce((a,b)=>a+b,0);
 const order=real.map((v,i)=>({i,f:v-counts[i]})).sort((a,b)=>b.f-a.f);
 for(let k=0;k<rest;k++)counts[order[k%3].i]++;
 $('populationPeople').innerHTML=counts.map((v,i)=>Array(v).fill(`<i class="${['e','u','n'][i]}"></i>`).join('')).join('');
 $('quarterTrack').style.width=(100*(milestonePaused?48:world.quarter%48)/48)+'%';
 $('milestoneNotice').hidden=!milestonePaused;
 $('milestoneText').textContent='Q'+world.quarter+'（'+fmt(world.quarter/4,1)+' 年）检查点：已暂停，不是终点。保存或调整政策后，可继续 Q'+(world.quarter+1)+'。';
 $('horizonNote').hidden=world.quarter<=48;
 renderTiming();
 $('scenarioCurrent').textContent=E.SCENARIOS[world.scenario].label+' · 种子 '+world.seed;
 document.querySelectorAll('[data-start]').forEach(el=>el.classList.toggle('current',el.dataset.start===world.scenario));
 document.documentElement.dataset.gameVersion='0.3.2';
 policyStatus();
}
function compactRun(){const d=savedRun();return {schema:d.schema,version:d.version,config:d.config,quarter:d.quarter,policyLog:d.policyLog,ui:d.ui};}
function renderTiming(){
 const t=world.timing,hasShock=world.scenario!=='baseline',unit=q=>'Q'+q+' / '+(q*3)+'个月';
 $('timelineStatus').textContent=(hasShock?'冲击 '+unit(t.shockStart)+' 起，'+t.rampQuarters+' 季达到设定强度':'无额外外部冲击')+' · 下一暂停点 Q'+pauseAt+' · 播放速度不改变经济时间';
 const first=world.history[0];
 const events=[['首次企业群体清算',h=>h.nodes.some(n=>n.closed&&['lab','cloud','chip','hyper','legacy'].includes(n.kind))],['大盘较起点跌20%',h=>h.sp500<=80],['就业比少10个百分点',h=>h.employmentRate<=first.employmentRate-10],['首次银行群体清算',h=>h.bankDefaults>0]];
 $('firstStress').innerHTML=events.map(([label,test])=>{const hit=world.history.find(test);return `<span>${label}：<strong>${hit?unit(hit.quarter):'尚未触及'}</strong></span>`;}).join('');
}
function fastDemo(){
 stopPlayback();showTiming({shockStart:1,rampQuarters:1});importedLaborConfig=null;showLabor(E.Labor.DEFAULTS);
 $('scenario').value='disappointment';$('severity').value='1.5';$('bankBuffer').value='.04';$('seed').value=42;$('preset').value='market';showPolicy(E.DEFAULT_POLICY);$('moodPreview').value='auto';Object.keys(characterOverrides).forEach(k=>delete characterOverrides[k]);reset();runTo(8);
 toast('快速压力情景：Q1 即进入设定冲击，已跑两年；不是现实危机时间预测。');
}
function initExtras(){
 $('continueBtn').onclick=()=>guard(()=>{stopPlayback();next();});
 $('fastDemoBtn').onclick=()=>guard(fastDemo);

 $('artCredit').textContent=ART.credit;
 $('representativeTable').innerHTML=Object.values(E.REPRESENTATIVES).map(n=>`<tr><td>${esc(n.name)}</td><td class="left">${esc(n.group)}</td></tr>`).join('');
 document.querySelectorAll('[data-jump]').forEach(el=>el.onclick=()=>{const id=el.dataset.jump;if(id==='network')tab('network');$(id).scrollIntoView({block:'start',behavior:'smooth'});});
 document.querySelectorAll('[data-start]').forEach(el=>el.onclick=()=>guard(()=>{stopPlayback();showTiming(E.DEFAULT_TIMING);importedLaborConfig=null;showLabor(E.Labor.DEFAULTS);$('scenario').value=el.dataset.start;$('severity').value=1;$('bankBuffer').value=.105;$('preset').value='market';showPolicy(E.DEFAULT_POLICY);$('moodPreview').value='auto';Object.keys(characterOverrides).forEach(k=>delete characterOverrides[k]);reset();toast('已重开：'+E.SCENARIOS[world.scenario].label+'。点击下一季度开始。');}));
 for(const [k]of fields)$('p_'+k).addEventListener('input',policyStatus);
 $('preset').addEventListener('change',policyStatus);
 $('moodPreview').addEventListener('change',()=>{Object.keys(characterOverrides).forEach(k=>delete characterOverrides[k]);renderCast();});
 $('saveLocalBtn').onclick=()=>guard(()=>{stopPlayback();localStorage.setItem('ai-finance-game-v030',JSON.stringify(compactRun()));toast('已保存 Q'+world.quarter+'；关闭网页后也可读取。只保存在当前浏览器。');});
 $('loadLocalBtn').onclick=()=>guard(()=>{const raw=localStorage.getItem('ai-finance-game-v030');if(!raw){toast('本浏览器还没有保存的进度。');return;}restoreRun(JSON.parse(raw));toast('已从初始条件重算并恢复 Q'+world.quarter+'。');});
 window.__sandboxActions={savedRun,compactRun,restoreRun,next,runTo,render,characterState};
}

function init(){
$('laborFields').innerHTML=laborFields.map(([k,label,min,max,step])=>`<label class="field"><span class="field-head">${label}<span class="value" id="lv_${k}"></span></span><input type="range" id="l_${k}" min="${min}" max="${max}" step="${step}"></label>`).join('');showLabor(E.Labor.DEFAULTS);
for(const [k] of laborFields)$('l_'+k).oninput=()=>{$('lv_'+k).textContent=fmt(Number($('l_'+k).value)*100,0)+'%';};
$('laborRestartBtn').onclick=()=>guard(reset);$('laborDemoBtn').onclick=()=>guard(()=>laborDemo(false));$('exitDemoBtn').onclick=()=>guard(()=>laborDemo(true));$('moodPreview').onchange=()=>{renderCast();renderDetail();};
$('scenario').innerHTML=Object.entries(E.SCENARIOS).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('');$('scenario').value='disappointment';$('preset').innerHTML=Object.entries(E.PRESETS).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('');
$('policyFields').innerHTML=fields.map(([k,label,min,max,step])=>`<label class="field"><span class="field-head">${label}<span class="value" id="v_${k}"></span></span><input type="range" id="p_${k}" min="${min}" max="${max}" step="${step}"></label>`).join('');showPolicy(E.DEFAULT_POLICY);
for(const [k,,,,,f]of fields)$('p_'+k).oninput=()=>$('v_'+k).textContent=f(Number($('p_'+k).value));
for(const id of ['scenario','severity','seed','bankBuffer','shockStart','rampQuarters'])$(id).onchange=()=>guard(reset);for(const id of ['severity','bankBuffer'])$(id).oninput=showInputLabels;
$('preset').onchange=()=>{showPolicy(E.PRESETS[$('preset').value].policy);toast('已载入政策；点击“应用”或“重开”实施。');};
$('stepBtn').onclick=()=>guard(()=>{stopPlayback();next();});$('playBtn').onclick=()=>guard(togglePlayback);$('playSpeed').onchange=()=>{if(playing){clearTimeout(playTimer);playTimer=null;schedulePlayback();}};$('runBtn').onclick=()=>guard(()=>runTo(world.quarter<16?16:world.quarter+4));$('resetBtn').onclick=()=>guard(reset);$('demoBtn').onclick=()=>guard(demo);
$('applyBtn').onclick=()=>guard(()=>{pendingLate=false;E.setPolicy(world,policyValues());render();toast('政策已记录，将影响后续季度；财政措施另有审批延迟。');});
$('compareBtn').onclick=()=>guard(compare);$('stressBtn').onclick=()=>guard(stress);
$('branchBtn').onclick=()=>{stopPlayback();branch=savedRun();$('restoreBtn').disabled=false;toast('已保存 Q'+world.quarter+' 分支；可改政策后返回重跑。');};
$('restoreBtn').onclick=()=>guard(()=>{if(!branch)return;restoreRun(branch);toast('已返回保存的分支。');});
$('exportBtn').onclick=()=>download(`ai-finance-Q${world.quarter}-seed${world.seed}.json`,JSON.stringify(savedRun(),null,2));
$('csvBtn').onclick=()=>{const keys=['quarter','sp500','nasdaq','gpuPrice','gdp','employmentRate','nonEmploymentRate','participationRate','unemployment','employed','unemployedPersons','notInLaborForce','workingAgePopulation','employmentIndex','humanWorkIndex','hoursPerWorker','inflation','policyRate','treasuryYield','spread','dollar','technology','defaults','bankDefaults','cumulativeCreditLoss','recapSpent','workerSpent','govDebt','liquidityOutstanding'];download('ai-finance-history.csv','\uFEFF'+keys.join(',')+'\n'+world.history.map(h=>keys.map(k=>h[k]).join(',')).join('\n'),'text/csv;charset=utf-8');};
$('importBtn').onclick=()=>{stopPlayback();$('fileInput').click();};$('fileInput').onchange=async e=>{stopPlayback();const f=e.target.files[0];if(!f)return;if(f.size>10e6){toast('文件过大；上限 10MB。');return;}try{const data=JSON.parse(await f.text());guard(()=>{restoreRun(data);toast('已重新计算并恢复记录，而不是盲信文件里的结果。');});}catch(err){toast('导入失败：'+err.message);}e.target.value='';};
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
$('moreBtn').onclick=()=>{const expanded=$('extraControls').classList.toggle('expanded');$('moreBtn').setAttribute('aria-expanded',String(expanded));$('moreBtn').textContent=expanded?'收起':'更多';};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing){stopPlayback();toast('已暂停，返回后点击“自动播放”继续。');}});
window.addEventListener('pagehide',stopPlayback);
const facts=RESEARCH.verified_examples;$('facts').innerHTML='<h3>继承的资料样例（本轮未重新核验，不参与计算）</h3><div class="table-wrap"><table><thead><tr><th>主体 / 口径</th><th>金额 $B</th><th>时点</th><th>来源</th></tr></thead><tbody>'+facts.map(f=>`<tr><td class="left">${esc(f.entity)}<br><span class="muted">${esc(f.type)}</span></td><td>${fmt(f.amount_usd_bn,3)}</td><td>${esc(f.as_of)}</td><td>${esc(f.source_id)}</td></tr>`).join('')+'</tbody></table></div>';
$('sources').innerHTML=RESEARCH.sources.map(s=>`<div class="source"><div class="small muted">${s.id} · ${esc(s.organization)} · ${esc(s.date)}</div><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a><p>${esc(s.finding)}</p></div>`).join('');$('dataGaps').innerHTML=RESEARCH.not_verified_or_not_loaded.map(x=>'<p>'+esc(x)+'</p>').join('');reset();initExtras();}
preparePortraits().then(()=>guard(init)).catch(e=>window.__reportSandboxError('角色素材加载失败：'+e.message));
})();
