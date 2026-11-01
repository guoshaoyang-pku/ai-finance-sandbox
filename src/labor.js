/* Labor stock/flow sandbox. Synthetic parameters; not an estimate of US job losses.
 * Population: a FIXED cohort of 100 US civilian noninstitutional adults aged 16–64.
 * E + U + N = P; labor force = E + U. All transitions move people, never delete them.
 * Age scope differs from headline BLS 16+ rates. No U-6 estimate is manufactured.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.AILabor=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const DEFAULTS={automationCeiling:.70,newJobsOffset:.30,transitionSpeed:.16,exitRate:.12,reentryRate:.01425,hiringRate:.40,separationRate:.50,hoursReduction:.20,demandFeedback:.20};
const RANGES={automationCeiling:[0,1],newJobsOffset:[0,1.5],transitionSpeed:[0,1],exitRate:[0,1],reentryRate:[0,1],hiringRate:[0,1],separationRate:[0,1],hoursReduction:[0,1],demandFeedback:[0,1]};
function validate(config={}){const c={...DEFAULTS,...config};for(const [k,v] of Object.entries(c)){if(!RANGES[k]||!Number.isFinite(v)||v<RANGES[k][0]||v>RANGES[k][1])throw Error('Invalid labor parameter '+k);}return c;}
function create(config={}){return {config:validate(config),ageScope:'US civilian noninstitutional ages 16–64; synthetic fixed cohort',population:100,employed:72.58,unemployed:3.42,inactive:24,automation:0,hours:38,baseEmployment:72.58,baseHours:38,previousIncomeIndex:100,incomeIndex:100,flows:{separations:0,hires:0,exits:0,reentries:0}};}
function metrics(l){const p=l.population,lf=l.employed+l.unemployed;const hours=l.employed*l.hours;return {
 workingAgePopulation:p,employed:l.employed,unemployedPersons:l.unemployed,notInLaborForce:l.inactive,laborForce:lf,
 employmentRate:100*l.employed/p,nonEmploymentRate:100*(l.unemployed+l.inactive)/p,participationRate:100*lf/p,
 unemployment:lf>1e-10?100*l.unemployed/lf:null,employmentIndex:100*l.employed/l.baseEmployment,
 humanWorkIndex:100*hours/(l.baseEmployment*l.baseHours),hoursPerWorker:l.hours,
 automationShare:100*l.automation,laborIncomeIndex:l.incomeIndex,
 employmentLossPP:100*(l.baseEmployment-l.employed)/p};}
function audit(l){const err=l.employed+l.unemployed+l.inactive-l.population;const vals=[l.population,l.employed,l.unemployed,l.inactive,l.hours,l.automation];if(vals.some(x=>!Number.isFinite(x)||x< -1e-8)||l.population<=0||Math.abs(err)>1e-8||l.automation>1+1e-8)throw Error('Labor population accounting failed');const m=metrics(l);if(Math.abs(m.employmentRate+m.nonEmploymentRate-100)>1e-8)throw Error('Labor ratio accounting failed');return err;}
function step(l,input={}){
 const c=l.config,gdp=input.gdp===undefined?100:input.gdp,quarter=input.quarter||0;
 const target=clamp((input.displacement||0)/.65,0,1)*c.automationCeiling;
 l.automation+=c.transitionSpeed*(target-l.automation);
 const trend=100*Math.pow(1.0045,quarter);
 const cycle=clamp(1+.8*(gdp/trend-1),0,1.35);
 // Replacement refers to original jobs, NOT a share imposed on final unemployment.
 // New jobs offset is independent and may exceed 100%, allowing complementarity.
 const slots=clamp(l.baseEmployment*(1-l.automation+c.newJobsOffset*l.automation)*cycle,0,l.population);
 const support=clamp((input.actualWorkerSpending||0)/8,0,1);
 const separations=Math.min(l.employed,Math.max(0,l.employed-slots)*c.separationRate);
 let e=l.employed-separations,u=l.unemployed+separations,n=l.inactive;
 const reentries=Math.min(n,n*clamp(c.reentryRate*(1-.8*l.automation)+.012*support,0,1));
 n-=reentries;u+=reentries;
 const hires=Math.min(u,Math.max(0,slots-e)*clamp(c.hiringRate+.20*support,0,1));
 e+=hires;u-=hires;
 const exits=Math.min(u,u*c.exitRate*(1-.40*support));
 u-=exits;n+=exits;
 l.employed=e;l.unemployed=u;l.inactive=n;
 l.hours=l.baseHours*(1-c.hoursReduction*l.automation);
 l.previousIncomeIndex=l.incomeIndex;
 // Labor-income proxy fixes real compensation per hour. Not household income/welfare.
 l.incomeIndex=100*l.employed*l.hours/(l.baseEmployment*l.baseHours);
 l.flows={separations,hires,exits,reentries,slots};
 audit(l);return metrics(l);
}
return {DEFAULTS,RANGES,validate,create,metrics,audit,step};
});
