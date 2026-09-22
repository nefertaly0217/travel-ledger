(() => {
"use strict";
const API="https://travel.nefertaly0217.workers.dev/api/ledger-sync";
const CONFIG="travel-ledger:cloud-connection:v1",LOCAL="travel-plan:runtime:v1:italy-2026-10";
const $=id=>document.getElementById(id);
let token="",busy=false,dirty=false,revision=0,staged=null,initial=null;
const status=text=>$("sync-status").textContent=text;
function connection(){try{return JSON.parse(localStorage.getItem(CONFIG)||"null")?.token||"";}catch{return "";}}
function storeToken(value){localStorage.setItem(CONFIG,JSON.stringify({token:value}));if(connection()!==value)throw Error("浏览器无法保存连接码，请检查隐私设置。");}
async function api(method,key,data){
 let response;
 try{response=await fetch(API,{method,cache:"no-store",headers:{Authorization:"Bearer "+key,...(data?{"Content-Type":"application/json"}:{})},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(20000)});}
 catch{throw Error("无法连接云端，请检查网络后重试。当前操作尚未确认保存。");}
 let result;try{result=await response.json();}catch{throw Error("云端接口尚未部署完成，请稍后刷新重试。");}
 if(!response.ok)throw Error(result.error||"云端操作失败");
 return result;
}
function showConnected(){
 $("sync-local").hidden=true;$("sync-connected").hidden=false;
 $("sync-code").value=token;
 status("已连接共享账本 · 云端版本 "+revision);
}
function pristine(){return !dirty&&!busy&&!document.hidden&&!document.querySelector("#ledger-root")?.contains(document.activeElement);}
async function open(){
 token=connection();
 let adapter;
 if(token){
  $("sync-local").hidden=true;$("sync-connected").hidden=false;$("sync-code").value=token;
  status("正在读取云端账本…");
  try{initial=await api("GET",token);revision=initial.revision;}
  catch(e){status(e.message);$("ledger-root").textContent="云端账本未读取成功。为防止误覆盖，暂未打开编辑。请点击“读取云端最新”重试，或断开连接查看本地备份。";return;}
  adapter={mode:"cloud",
   async load(){if(initial){const data=initial.data;initial=null;return data;}staged=await api("GET",token);return staged.data;},
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
 await window.TravelLedger.init({root:"#ledger-root",tripId:"italy-2026-10",configUrl:false,persistenceMode:"local",...(adapter?{adapter}:{})});
 if(token){
  showConnected();
  const refresh=async()=>{
   if(!pristine())return;
   busy=true;
   try{await window.TravelLedger.refreshShared({canApply:()=>!dirty&&!document.hidden&&!$("ledger-root").contains(document.activeElement)});}
   catch(e){status(e.message);}
   finally{busy=false;}
  };
  setInterval(refresh,8000);window.addEventListener("focus",refresh);
 }else status("当前为本地账本。请在有账单的电脑上创建共享账本，再用手机连接。");
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
 // Preserve the original local snapshot before uploading.
 const raw=localStorage.getItem(LOCAL);
 localStorage.setItem(CONFIG+":local-backup",raw||JSON.stringify(data));
 const key=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,"0")).join("");
 status("正在创建共享账本并上传…");
 await api("POST",key,{data});storeToken(key);location.reload();
});
$("sync-connect").onclick=()=>action(async()=>{
 const key=$("sync-input").value.trim().toLowerCase();
 if(!/^[a-f0-9]{64}$/.test(key))throw Error("请粘贴电脑上完整的 64 位连接码。");
 await api("GET",key);
 if(!confirm("将打开这个共享账本。本设备原有本地账单会保留，但不会自动合并到云端。继续吗？"))return;
 storeToken(key);location.reload();
});
$("sync-copy").onclick=async()=>{
 $("sync-code").type="text";$("sync-code").focus();$("sync-code").select();
 try{await navigator.clipboard.writeText(token);status("连接码已复制，请私下发送到手机，粘贴到手机账本的连接框。");}
 catch{status("连接码已选中，请手动复制。");}
};
$("sync-reload").onclick=()=>{if(dirty&&!confirm("有未保存的输入。读取最新账本会清除这些输入，请先复制保留。继续吗？"))return;location.reload();};
$("sync-disconnect").onclick=()=>{
 if(!confirm("断开本设备的云端连接并返回原本地账本？云端账单不会删除。请先保管好连接码。"))return;
 localStorage.removeItem(CONFIG);location.reload();
};
$("ledger-root").addEventListener("input",()=>{dirty=true;});
$("ledger-root").addEventListener("change",()=>{dirty=true;});
window.addEventListener("travel-ledger:changed",()=>{dirty=false;});
window.addEventListener("travel-ledger:navigate",event=>{
 const hash=event.detail?.tab==="stats"?"#ledger-stats":"#ledger";if(location.hash!==hash)history.replaceState(null,"",hash);
});
window.addEventListener("hashchange",()=>window.TravelLedger.setActiveTab(location.hash==="#ledger-stats"?"stats":"entry",{updateHash:false,forceRender:true}));
void open().catch(e=>status(e.message));
})();
