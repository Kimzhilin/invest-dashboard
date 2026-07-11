/* =========================================================
   持仓管理运行时  Portfolio
   - 合并基础池(FUND_DATA.funds + ASHARE_SEED) 与 用户本地存储
   - 支持：增加 / 删除 / 编辑 / 调仓(目标配置+交易记录) / 同步(实时估值)
   - 全部持久化在浏览器 localStorage(本机)，无后端
   ========================================================= */
window.Portfolio = (function(){
  var LS_KEY='portf_v1';
  var state = load();
  var listeners=[];

  function load(){ try{ return JSON.parse(localStorage.getItem(LS_KEY))||{}; }catch(e){ return {}; } }
  function save(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }catch(e){} }
  function clone(o){ return JSON.parse(JSON.stringify(o)); }

  function baseUniverse(){
    var m={};
    if(window.FUND_DATA && window.FUND_DATA.funds) window.FUND_DATA.funds.forEach(function(f){ m[f.code]=f; });
    if(window.ASHARE_SEED) window.ASHARE_SEED.forEach(function(a){ m[a.code]=a; });
    return m;
  }

  function getPortfolio(){
    var base=baseUniverse(); var res=[];
    Object.keys(base).forEach(function(code){
      if(state.removed && state.removed.indexOf(code)>=0) return;
      var item=clone(base[code]);
      var ov=state.items && state.items[code];
      if(ov){ for(var k in ov){ if(ov[k]!==undefined) item[k]=ov[k]; } }
      if(item.shares && item.price && item.amount==null) item.amount=item.shares*item.price;
      if(item.amount==null) item.amount=0;
      if(item.costAmount==null) item.costAmount=item.amount;
      res.push(item);
    });
    if(state.items){ Object.keys(state.items).forEach(function(code){
      if(base[code]) return;
      var it=clone(state.items[code]);
      if(it.amount==null) it.amount=0;
      if(it.costAmount==null) it.costAmount=it.amount;
      res.push(it);
    }); }
    return res;
  }

  function onChange(cb){ if(listeners.indexOf(cb)<0) listeners.push(cb); }
  function emit(){ listeners.forEach(function(cb){ try{cb();}catch(e){console.error(e);} }); }
  function refresh(){ emit(); }

  function ensureItems(code){
    if(!state.items) state.items={};
    if(!state.items[code]){
      var base=baseUniverse()[code];
      state.items[code]= base? clone(base) : {code:code, added:true};
    }
    return state.items[code];
  }

  function addHolding(meta){
    if(!meta || !meta.code) return false;
    state.items=state.items||{};
    var it=ensureItems(meta.code);
    for(var k in meta){ if(meta[k]!==undefined) it[k]=meta[k]; }
    it.added=true;
    save(); emit(); return true;
  }
  function removeHolding(code){
    var base=baseUniverse();
    if(base[code]){ state.removed=state.removed||[]; if(state.removed.indexOf(code)<0) state.removed.push(code); }
    else if(state.items && state.items[code]){ delete state.items[code]; }
    save(); emit();
  }
  function updateHolding(code, fields, silent){
    var it=ensureItems(code);
    for(var k in fields){ if(fields[k]!==undefined) it[k]=fields[k]; }
    save();
    if(!silent) emit();
  }
  function recordTxn(t){ state.txns=state.txns||[]; state.txns.push(t); save(); }
  function setTarget(code, frac){
    state.targets=state.targets||{};
    if(frac==null||frac===''||+frac<=0) delete state.targets[code];
    else state.targets[code]=+frac;
    save(); emit();
  }
  function clearTargets(){ state.targets={}; save(); emit(); }

  function exportJSON(){ return JSON.stringify(state, null, 2); }
  function importJSON(str){
    var o=JSON.parse(str);
    if(!o||typeof o!=='object') throw new Error('格式错误');
    if(!o.items) o.items={}; if(!o.removed) o.removed=[]; if(!o.txns) o.txns=[]; if(!o.targets) o.targets={};
    state=o; save(); emit();
  }

  // ---------- jsonp ----------
  function jsonp(url, cbName, timeoutMs){
    return new Promise(function(res,rej){
      var s=document.createElement('script');
      var cbn='_jp'+Math.random().toString(36).slice(2);
      window[cbn]=function(d){ try{s.remove();}catch(e){} delete window[cbn]; res(d); };
      s.onerror=function(){ try{s.remove();}catch(e){} delete window[cbn]; rej(new Error('net')); };
      s.src=url+(url.indexOf('?')>=0?'&':'?')+cbName+'='+cbn;
      document.body.appendChild(s);
      setTimeout(function(){ if(window[cbn]){ delete window[cbn]; try{s.remove();}catch(e){} rej(new Error('timeout')); } }, timeoutMs||12000);
    });
  }

  // ---------- 历史行情补足 ----------
  function fetchStockHistory(bench){
    var url='https://push2his.eastmoney.com/api/qt/stock/kline/get?secid='+bench+'&fields1=f1&fields2=f51,f53&klt=101&fqt=1&beg=20250101&end=20500101&lmt=220';
    return jsonp(url,'cb',12000).then(function(d){
      if(!d||d.rc!==0||!d.data||!d.data.klines) return [];
      return d.data.klines.map(function(s){ var p=s.split(','); return {date:p[0], dwjz:parseFloat(p[1])}; });
    }).catch(function(){ return []; });
  }
  function fetchFundHistory(code){
    var url='https://api.fund.eastmoney.com/f10/lsjz?fundCode='+code+'&pageIndex=1&pageSize=300';
    return jsonp(url,'callback',10000).then(function(d){
      if(!d||!d.Data||!d.Data.LSJZList) return [];
      return d.Data.LSJZList.map(function(x){ return {date:x.FSRQ, dwjz:parseFloat(x.DWJZ)}; }).reverse();
    }).catch(function(){ return []; });
  }
  function ensureHistory(){
    var list=getPortfolio(); var pending=list.length; var done=0;
    return new Promise(function(resolve){
      if(!pending){ resolve(); return; }
      list.forEach(function(f){
        if(f.navHistory && f.navHistory.length>3){ if(++done>=pending) resolve(); return; }
        var p = f.isStock ? fetchStockHistory(f.bench) : fetchFundHistory(f.code);
        p.then(function(hist){
          if(hist && hist.length>3){
            f.navHistory=hist;
            var it = state.items && state.items[f.code];
            if(!it){ it=ensureItems(f.code); }
            it.navHistory=hist; save();
          }
        }).finally(function(){ if(++done>=pending) resolve(); });
      });
    });
  }

  // ---------- 实时同步(估值/价格) ----------
  function fetchStockLive(bench){
    var url='https://push2.eastmoney.com/api/qt/stock/get?secid='+bench+'&fields=f43,f44,f45,f46,f57,f58,f60,f169,f170';
    return jsonp(url,'cb',10000).then(function(d){
      if(!d||d.rc!==0||!d.data) return null;
      var dt=d.data;
      return { name: dt.f58||'', price: parseFloat(dt.f43), preClose: parseFloat(dt.f60), chgPct: parseFloat(dt.f170) };
    }).catch(function(){ return null; });
  }
  function syncLive(){
    window.__liveFundMap = window.__liveFundMap || {};
    var list=getPortfolio();
    var fundsList=list.filter(function(f){return !f.isStock;});
    var stocksList=list.filter(function(f){return f.isStock;});
    window.jsonpgz=function(d){ window.__liveFundMap[d.fundcode]={gsz:d.gsz,gszzl:parseFloat(d.gszzl),gztime:d.gztime}; };
    fundsList.forEach(function(f){ var s=document.createElement('script'); s.src='https://fundgz.1234567.com.cn/js/'+f.code+'.js'; document.body.appendChild(s); });
    var sp=stocksList.map(function(f){ return fetchStockLive(f.bench).then(function(live){
      if(live){ f.live=live; if(f.shares){ f.amount=f.shares*live.price; f.price=live.price; } }
    }); });
    return Promise.all(sp).then(function(){
      return new Promise(function(res2){
        setTimeout(function(){
          list.forEach(function(f){ if(!f.isStock && window.__liveFundMap[f.code]) f.live=window.__liveFundMap[f.code]; });
          list.forEach(function(x){ if(x.isStock && x.live && x.shares){ var it=ensureItems(x.code); it.amount=x.amount; it.price=x.price; } });
          state.lastSync=new Date().toISOString(); save();
          res2();
        }, 1500);
      });
    });
  }

  // ---------- 汇总 ----------
  function summary(){
    var list=getPortfolio();
    var totalValue=0, totalCost=0, today=0;
    var bySector={};
    list.forEach(function(f){
      var est, price, pre;
      if(f.isStock){
        price=(f.live&&f.live.price)?f.live.price:f.price;
        pre=(f.live&&f.live.preClose)?f.live.preClose:(f.price||price);
        est=f.shares? f.shares*price : f.amount;
        if(f.shares) today += f.shares*(price-pre);
      } else {
        var gz=(f.live&&f.live.gszzl!=null)?parseFloat(f.live.gszzl):0;
        est=f.amount*(1+gz/100);
        today += f.amount*gz/100;
      }
      totalValue += est; totalCost += (f.costAmount||0);
      var sec=f.sector||'其他'; bySector[sec]=bySector[sec]||0; bySector[sec]+=est;
    });
    return {
      count:list.length, totalValue:totalValue, totalCost:totalCost,
      totalPnl:totalValue-totalCost, today:today,
      bySector:bySector, lastSync:state.lastSync,
      targets:state.targets||{}, txns:state.txns||[]
    };
  }

  // ---------- 添加时查询元数据 ----------
  function secidOf(code){
    code=String(code).toUpperCase().replace(/\.(SH|SZ|BJ)$/,'');
    if(/\.(SH)$/.test(String(code).toUpperCase())) return '1.'+code;
    if(/^6/.test(code)||/^9/.test(code)||/^11/.test(code)) return '1.'+code;
    return '0.'+code;
  }
  function lookup(code, isStock){
    code=String(code).trim();
    if(isStock){
      var bench=secidOf(code);
      return fetchStockLive(bench).then(function(live){
        if(!live) return null;
        return { code:code, name:live.name||code, type:'股票-A股', sector:'其他', bench:bench, isStock:true,
                 price:live.price, shares:0, costPrice:live.price,
                 amount:0, costAmount:0, navHistory:[] };
      });
    } else {
      var url='https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key='+encodeURIComponent(code);
      return jsonp(url,'callback',10000).then(function(d){
        var arr=(d&&d.Data)||[]; var hit=arr[0]||{};
        return { code:code, name:hit.NAME||'', type:hit.TYPE||'基金', sector:'基金', bench:'', isStock:false,
                 amount:0, costAmount:0, navHistory:[] };
      }).catch(function(){ return { code:code, name:'', type:'基金', sector:'基金', bench:'', isStock:false, amount:0, costAmount:0, navHistory:[] }; });
    }
  }

  return {
    getPortfolio:getPortfolio, addHolding:addHolding, removeHolding:removeHolding,
    updateHolding:updateHolding, recordTxn:recordTxn, setTarget:setTarget, clearTargets:clearTargets,
    ensureHistory:ensureHistory, syncLive:syncLive, summary:summary, refresh:refresh,
    exportJSON:exportJSON, importJSON:importJSON, lookup:lookup, secidOf:secidOf,
    onChange:onChange, getState:function(){return state;}
  };
})();
