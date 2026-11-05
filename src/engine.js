const storageKey='case-clash-lab-v1';
export function freshState(){return{balance:1200,xp:0,level:1,inventory:[],history:[],dailyAt:'',opened:0,achievements:[],season:0}}
export function loadState(accountId='guest'){try{return{...freshState(),...JSON.parse(localStorage.getItem(accountId==='guest'?storageKey:`${storageKey}:${accountId}`)||'{}')}}catch{return freshState()}}
export function saveState(state,accountId='guest'){localStorage.setItem(accountId==='guest'?storageKey:`${storageKey}:${accountId}`,JSON.stringify(state))}
export function rng(seed){if(seed===undefined||seed===null||seed==='')return Math.random;let t=Number(seed)||1;return()=>{t+=0x6D2B79F5;let x=t;x=Math.imul(x^x>>>15,x|1);x^=x+Math.imul(x^x>>>7,x|61);return((x^x>>>14)>>>0)/4294967296}}
export function weightedPick(entries,random=Math.random){let value=random(),sum=0;for(const e of entries){sum+=e.weight;if(value<sum)return e.item}return entries.at(-1)?.item}
export function pickCaseItem(box,random=Math.random){const tier=weightedPick(box.tiers.map((weight,index)=>({weight,item:index})),random);const pool=box.items.filter(item=>({Обычный:0,Необычный:1,Редкий:2,Эпический:3,Легендарный:4,Мифический:5,Абсурдный:6}[item.rarity]===tier));return pool[Math.floor(random()*pool.length)]}
export function addXp(state,amount){state.xp+=amount;while(state.xp>=state.level*500){state.xp-=state.level*500;state.level++;state.balance+=250}}
export function addItem(state,item,source){const owned={...item,uid:crypto.randomUUID(),obtainedAt:new Date().toISOString(),source};state.inventory.unshift(owned);state.history.unshift({item:owned,source,at:owned.obtainedAt});state.opened++;addXp(state,25);return owned}
export function gradeIndex(name){return ['Обычный','Необычный','Редкий','Эпический','Легендарный','Мифический','Абсурдный'].indexOf(name)}
export function entropySeed(){return Math.floor(Math.random()*2147483646)+1}
