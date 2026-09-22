
"use strict";
const KEY="travel-plan:runtime:v1:italy-2026-10";
const OLD="https://travel.nefertaly0217.workers.dev";
const NEW="https://nefertaly0217.github.io";
const isOld=location.origin===OLD;
const $=id=>document.getElementById(id);
let sourceWindow=null,pending=null,baseline=null;
const nonce=globalThis.crypto?.randomUUID?.() || Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16)).join("-");
function say(text){$("status").textContent=text;}
function read(){const raw=localStorage.getItem(KEY);return {raw,data:raw?JSON.parse(raw):{version:1,settings:null,travelers:[],bills:[]}};}
function validate(data){
 if(!data||!Array.isArray(data.travelers)||!Array.isArray(data.bills))throw Error("文件不是有效的旅行账本。");
 const people=new Set(),bills=new Set();
 for(const t of data.travelers){
  if(typeof t.id!=="string"||!t.id||typeof t.name!=="string"||!t.name.trim()||people.has(t.id))throw Error("成员资料有冲突，请保留原文件并检查。");
  people.add(t.id);
 }
 for(const b of data.bills){
  if(typeof b.id!=="string"||!b.id||bills.has(b.id)||!Number.isSafeInteger(b.originalAmountCents)||b.originalAmountCents<=0||!(/^[A-Z]{3}$/).test(b.currency)||!people.has(b.payerId)||!Array.isArray(b.participantIds)||!b.participantIds.length||b.participantIds.some(id=>!people.has(id)))throw Error("账单资料不完整，未修改新账本。");
  bills.add(b.id);
 }
 return data;
}
function canonical(value){
 if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
 if(value&&typeof value==="object")return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}";
 return JSON.stringify(value);
}
function merge(target,source){
 validate(target);validate(source);
 const next=JSON.parse(JSON.stringify(target)),members=new Map(next.travelers.map(t=>[t.id,t]));
 for(const t of source.travelers){
  const existing=members.get(t.id);
  if(existing&&existing.name!==t.name)throw Error("成员编号冲突："+existing.name+" / "+t.name+"。请把此提示发给我，暂未修改账单。");
  if(!existing){next.travelers.push(t);members.set(t.id,t);}
 }
 const bills=new Map(next.bills.map(b=>[b.id,b]));
 let added=0,skipped=0;
 for(const b of source.bills){
  if(bills.has(b.id)){
   if(canonical(bills.get(b.id))!==canonical(b))throw Error("发现同一编号但内容不同的账单，已停止迁移，请先核对两个账本。");
   skipped++;
  }else{next.bills.push(b);bills.set(b.id,b);added++;}
 }
 next.settings=target.settings||source.settings;
 next.version=1;next.updatedAt=new Date().toISOString();
 return {data:next,added,skipped};
}
function totals(data){const sums={};for(const b of data.bills){sums[b.currency]=(sums[b.currency]||0)+b.originalAmountCents;if(!Number.isSafeInteger(sums[b.currency]))throw Error("合计金额过大。");}return Object.entries(sums).map(([c,n])=>c+" "+(n/100).toFixed(2)).join(" · ")||"无账单";}
function download(data){
 const blob=new Blob([JSON.stringify({format:"travel-ledger-backup",data},null,2)],{type:"application/json"});
 const a=document.createElement("a"),url=URL.createObjectURL(blob);a.href=url;a.download="travel-ledger-backup-"+new Date().toISOString().slice(0,10)+".json";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function parseBackup(text){
 let payload;
 try{payload=JSON.parse(text.replace(/^\uFEFF/,"").trim());}catch(e){throw Error("无法解析 JSON。请粘贴完整备份内容，或选择下载的 .json 文件。");}
 return payload?.format==="travel-ledger-backup"?payload.data:payload;
}
function preview(data){
 pending=null;$("import").hidden=true;
 validate(data);
 if(!data.bills.length)throw Error("没有找到旧账单。请使用原来记账的设备和浏览器打开旧账本。");
 const target=read(),result=merge(target.data,data);
 baseline=target.raw;pending=result;
 say("旧账本："+data.bills.length+" 笔，"+totals(data)+"。\n将新增 "+result.added+" 笔，跳过 "+result.skipped+" 笔重复账单。\n迁移后共 "+result.data.bills.length+" 笔，"+totals(result.data)+"。\n请关闭其他正在编辑新账本的标签页，再点击确认。");
 $("import").hidden=false;
}
function guarded(fn){return (...args)=>{try{fn(...args);}catch(e){say(e.message||"操作失败，未完成迁移。");}};}
if(isOld){
 $("title").textContent="从旧账本迁移";
 $("source").hidden=false;
 $("home").href=OLD+"/#ledger";
 let data;
 guarded(()=>{data=validate(read().data);say("当前浏览器找到 "+data.bills.length+" 笔旧账单："+totals(data)+(data.bills.length?"":"。请换用原来记账的浏览器。"));})();
 $("send").onclick=guarded(()=>{
  data=validate(read().data);
  if(!data.bills.length)throw Error("没有旧账单可迁移，请使用原来记账的浏览器。");
  const token=new URLSearchParams(location.search).get("token");
  if(window.opener&&token){window.opener.postMessage({type:"travel-ledger-migration",token,data},NEW);say("账单已发送，请返回新账本窗口核对并确认迁移。");}
  else{download(data);say("已导出备份。请打开新账本迁移页，选择这个 JSON 文件。");}
 });
 $("download").onclick=guarded(()=>download(validate(read().data)));
 $("show-text").onclick=guarded(()=>{
  const snapshot=validate(read().data);
  if(!snapshot.bills.length)throw Error("当前浏览器没有找到旧账单。请先确认同一浏览器打开旧账本能看到记录。");
  $("transfer-text").value=JSON.stringify({format:"travel-ledger-backup",data:snapshot});
  $("text-area").hidden=false;$("transfer-text").focus();$("transfer-text").select();
  say("已生成 "+snapshot.bills.length+" 笔账单的备份文本。复制下方全部文字，再点击“前往新账本粘贴”。");
 });
 $("copy-text").onclick=async()=>{
  $("transfer-text").focus();$("transfer-text").select();
  try{await navigator.clipboard.writeText($("transfer-text").value);say("已复制。点击“前往新账本粘贴”。");}
  catch(e){say("浏览器未允许自动复制。文字已选中，请手动复制（手机长按选择全部，电脑按 Ctrl/Cmd+C）。");}
 };
}else if(location.origin===NEW){
 $("target").hidden=false;
 $("home").href="./#ledger";
 $("open").onclick=guarded(()=>{
  sourceWindow=window.open(OLD+"/ledger-migrate.html?token="+encodeURIComponent(nonce),"travelLedgerMigration");
  say(sourceWindow?"请在弹出的旧账本页面点击“发送到新账本”，然后返回此页。":"浏览器阻止了弹窗，请允许弹窗或使用下方的备份文件导入。");
 });
 window.addEventListener("message",guarded(event=>{
  if(event.origin!==OLD||event.source!==sourceWindow||event.data?.type!=="travel-ledger-migration"||event.data.token!==nonce)return;
  preview(event.data.data);
 }));
 $("file").onchange=async event=>{
  pending=null;$("import").hidden=true;
  try{const file=event.target.files[0];if(!file)return;if(file.size>10000000)throw Error("备份文件过大。");const text=typeof file.text==="function"?await file.text():await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error("读取文件失败，请使用粘贴备份文本。"));reader.readAsText(file);});preview(parseBackup(text));event.target.value="";}
  catch(e){say(e.message||"无法读取文件。");}
 };
 $("read-text").onclick=guarded(()=>preview(parseBackup($("paste-text").value)));
 $("import").onclick=guarded(()=>{
  if(!pending)return;
  if(localStorage.getItem(KEY)!==baseline)throw Error("新账本刚刚发生变化，请重新读取旧账单后迁移。");
  // Keep the complete previous snapshot, including non-ledger collections.
  if(baseline!==null)localStorage.setItem(KEY+":migration-backup:"+Date.now(),baseline);
  const serialized=JSON.stringify(pending.data);
  localStorage.setItem(KEY,serialized);
  if(localStorage.getItem(KEY)!==serialized)throw Error("浏览器未能保存账单，请下载备份后重试。");
  const count=pending.data.bills.length;
  pending=null;$("import").hidden=true;
  say("迁移完成！新账本现在有 "+count+" 笔账单。旧账本数据保持不变。点击下方“打开账本”查看。");
 });
 say("请使用原来记账的设备和浏览器。迁移只在浏览器内进行，不会把账单上传到 GitHub。");
}
