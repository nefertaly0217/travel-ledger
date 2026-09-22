(() => {
"use strict";
const API="https://vqewzeilwuqasphqjydf.supabase.co/functions/v1/ledger-sync";
const CONFIG="travel-ledger:cloud-connection:v1",LOCAL="travel-plan:runtime:v1:italy-2026-10";
const $=id=>document.getElementById(id);
let token="",busy=false,dirty=false,revision=0,staged=null,initial=null;
const status=text=>$("sync-status").textContent=text;
function linkToken(){return new URLSearchParams(location.hash.split("?")[1]||"").get("book")||"";}
function shareLink(key=token){const url=new URL(location.href);url.search="";url.hash="ledger?book="+key;return url.href;}
function tabHash(tab){return (tab==="stats"?"#ledger-stats":"#ledger")+(token?"?book="+token:"");}
function remember(value){try{storeToken(value);}catch{}}
function showLink(){ $("sync-link").value=shareLink(); }

function connection(){try{return JSON.parse(localStorage.getItem(CONFIG)||"null")?.token||"";}catch{return "";}}
function storeToken(value){localStorage.setItem(CONFIG,JSON.stringify({token:value}));if(connection()!==value)throw Error("浏览器无法保存连接码，请检查隐私设置。");}

async function api(method,key,data){
 let response;const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),20000);
 try{
  response=await fetch(API,{
   method,
   cache:"no-store",
   headers:{Authorization:"Bearer "+key,...(data?{"Content-Type":"application/json"}:{})},
   body:data?JSON.stringify(data):undefined,
   signal:controller.signal
  });
 }catch{
  const error=new Error("无法连接云端，请检查网络后重试。当前操作尚未确认保存。");
  error.status=0;throw error;
 }finally{clearTimeout(timeout);}
 let result;try{result=await response.json();}catch{
  const error=new Error("云端接口返回异常，请稍后刷新重试。");error.status=response.status;throw error;
 }
 if(!response.ok){
  const message=result.error==="not_found"?"云端尚未建立这本账":result.error==="conflict"?"其他设备刚刚修改了账本，请先读取云端最新":result.error||"云端操作失败";
  const error=new Error(message);error.status=response.status;error.code=result.error||"";throw error;
 }
 return result;
}

function readJsonStorage(key){
 try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):null;}catch{return null;}
}
function validSeed(data){
 return data&&typeof data==="object"&&Array.isArray(data.travelers)&&Array.isArray(data.bills)&&(data.travelers.length>0||data.bills.length>0);
}
function bestLocalSeed(){
 const candidates=[
  readJsonStorage(LOCAL),
  readJsonStorage(CONFIG+":local-backup"),
  readJsonStorage(CONFIG+":cache")
 ].filter(validSeed);
 if(!candidates.length)return null;
 return candidates.sort((a,b)=>(b.bills?.length||0)-(a.bills?.length||0)||(b.travelers?.length||0)-(a.travelers?.length||0))[0];
}
function showConnected(){
 $("sync-local").hidden=true;$("sync-connected").hidden=false;
 showLink();
 status("已连接共享账本 · 云端版本 "+revision);
}
function pristine(){return !dirty&&!busy&&!document.hidden&&!document.querySelector("#ledger-root")?.contains(document.activeElement);}

async function open(){
 const incoming=linkToken();
 if(incoming&&!/^[a-f0-9]{64}$/i.test(incoming)){
  status("专属链接不完整，请重新复制完整链接。");
  $("ledger-root").textContent="链接无效，未切换账本。";
  return;
 }
 token=(incoming||connection()).toLowerCase();
 if(token)history.replaceState(null,"",tabHash(location.hash.startsWith("#ledger-stats")?"stats":"entry"));

 let adapter;
 if(token){
  $("sync-local").hidden=true;$("sync-connected").hidden=false;showLink();
  status("正在读取云端账本…");
  try{
   initial=await api("GET",token);
   revision=initial.revision;
   remember(token);
  }catch(e){
   if(e.status===404){
    const seed=bestLocalSeed();
    if(seed){
     status("云端尚无数据，正在把本机已有账单迁移到云端…");
     try{
      initial=await api("POST",token,{data:seed});
      revision=initial.revision;
      remember(token);
      status("本机账本已自动迁移到云端。");
     }catch(createError){
      if(createError.status===409){
       initial=await api("GET",token);
       revision=initial.revision;
       remember(token);
      }else throw createError;
     }
    }else{
     status("云端还没有这本账。请先在保存着原账单的电脑上打开同一条专属链接一次，系统会自动上传；之后手机刷新即可。");
     $("ledger-root").textContent="这台设备没有可用于首次迁移的本地账单。";
     return;
    }
   }else{
    status(e.message);
    $("ledger-root").textContent="云端账本未读取成功。为防止误覆盖，暂未打开编辑。请点击“读取云端最新”重试。";
    return;
   }
  }

  adapter={mode:"cloud",
   async load(){
    if(initial){const data=initial.data;initial=null;return data;}
    staged=await api("GET",token);return staged.data;
   },
   acceptLoad(){if(staged){revision=staged.revision;staged=null;showConnected();}},
   async save(data){
    busy=true;status("正在保存到云端…");
    try{
     const saved=await api("PUT",token,{revision,data});revision=saved.revision;
     status("已同步到云端 · 版本 "+revision+" · "+new Date().toLocaleTimeString("zh-CN"));
     try{localStorage.setItem(CONFIG+":cache",JSON.stringify(saved.data));}catch{}
     return saved.data;
    }catch(e){status(e.message);throw e;}finally{busy=false;}
   }
  };
 }

 await window.TravelLedger.init({
  root:"#ledger-root",
  tripId:"italy-2026-10",
  configUrl:false,
  persistenceMode:"local",
  ...(adapter?{adapter}:{})
 });
 if(location.hash.startsWith("#ledger-stats"))window.TravelLedger.setActiveTab("stats",{updateHash:false,forceRender:true});

 if(token){
  showConnected();
  const refresh=async()=>{
   if(!pristine())return;
   busy=true;
   try{
    await window.TravelLedger.refreshShared({canApply:()=>!dirty&&!document.hidden&&!$("ledger-root").contains(document.activeElement)});
   }catch(e){status(e.message);}
   finally{busy=false;}
  };
  setInterval(refresh,8000);
  window.addEventListener("focus",refresh);
  document.addEventListener("visibilitychange",refresh);
  window.addEventListener("online",refresh);
 }else{
  status("首次在有账单的电脑上点击下方按钮。以后所有设备打开生成的专属链接，即可自动同步。");
 }
}

async function action(fn){
 if(busy)return;busy=true;
 for(const b of document.querySelectorAll("#sync-panel button"))b.disabled=true;
 try{await fn();}catch(e){status(e.message);}finally{busy=false;for(const b of document.querySelectorAll("#sync-panel button"))b.disabled=false;}
}

$("sync-create").onclick=()=>action(async()=>{
 const data=window.TravelLedger.getSnapshot();
 if(!data)throw Error("请等待本地账本加载完成。");
 if(dirty&&!confirm("页面有尚未保存的输入。这次只上传已保存的账单，是否继续？"))return;
 if(!confirm("将把当前电脑已保存的 "+data.bills.length+" 笔账单和 "+data.travelers.length+" 位成员上传到新的共享账本。继续吗？"))return;
 const raw=localStorage.getItem(LOCAL);
 localStorage.setItem(CONFIG+":local-backup",raw||JSON.stringify(data));
 const key=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,"0")).join("");
 status("正在创建共享账本并上传…");
 await api("POST",key,{data});
 remember(key);token=key;history.replaceState(null,"",shareLink(key));location.reload();
});

$("sync-copy").onclick=async()=>{
 showLink();$("sync-link").hidden=false;$("sync-link").focus();$("sync-link").select();
 try{await navigator.clipboard.writeText(shareLink());status("专属链接已复制。在手机打开这个完整链接即可自动同步，无需输入连接码。");}
 catch{status("完整链接已选中，请长按复制，或按 Ctrl/Cmd+C，再在其他设备打开。");}
};
$("sync-reload").onclick=()=>{if(dirty&&!confirm("有未保存的输入。读取最新账本会清除这些输入，请先复制保留。继续吗？"))return;location.reload();};
$("sync-disconnect").onclick=()=>{
 if(!confirm("断开本设备的云端连接并返回原本地账本？云端账单不会删除。请先保管好专属链接。"))return;
 try{localStorage.removeItem(CONFIG);}catch{}history.replaceState(null,"","#ledger");location.reload();
};
$("ledger-root").addEventListener("input",()=>{dirty=true;});
$("ledger-root").addEventListener("change",()=>{dirty=true;});
window.addEventListener("travel-ledger:changed",()=>{dirty=false;});
window.addEventListener("travel-ledger:navigate",event=>{
 const hash=tabHash(event.detail?.tab);if(location.hash!==hash)history.replaceState(null,"",hash);
});
window.addEventListener("hashchange",()=>{
 const incoming=linkToken();
 if(incoming&&incoming!==token){location.reload();return;}
 const tab=location.hash.startsWith("#ledger-stats")?"stats":"entry";
 if(token&&!incoming)history.replaceState(null,"",tabHash(tab));
 window.TravelLedger.setActiveTab(tab,{updateHash:false,forceRender:true});
});
void open().catch(e=>status(e.message));
})();