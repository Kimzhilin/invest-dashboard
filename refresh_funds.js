// 基金数据刷新：拉取每只基金最新一日净值，追加进 navHistory（去重、保留最近300条），写回 funds.js
const https = require('https');
const fs = require('fs');

function get(url, headers, timeout) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: headers || {} }, resp => {
      let d = '';
      resp.on('data', c => d += c);
      resp.on('end', () => resolve({ status: resp.statusCode, body: d }));
    });
    req.on('error', reject);
    req.setTimeout(timeout || 15000, () => req.destroy(new Error('timeout')));
  });
}

global.window = {};
require('./funds.js');
const FD = global.window.FUND_DATA;
const funds = FD.funds;

(async () => {
  let updated = 0;
  for (const f of funds) {
    try {
      const url = `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${f.code}&pageIndex=1&pageSize=20&startDate=&endDate=`;
      const res = await get(url, { Referer: 'http://fundf10.eastmoney.com/' });
      const j = JSON.parse(res.body);
      const list = j.Data && j.Data.LSJZList ? j.Data.LSJZList : [];
      if (!list.length) continue;
      const latest = list[0]; // 最新一条
      const date = latest.FSRQ;
      const dwjz = parseFloat(latest.DWJZ);
      const zzzl = latest.JZZZL === '' ? null : parseFloat(latest.JZZZL);
      const nav = f.navHistory || [];
      if (nav.length && nav[nav.length - 1].date === date) {
        // 同日已存在，更新数值
        nav[nav.length - 1].dwjz = dwjz; nav[nav.length - 1].zzzl = zzzl;
      } else {
        nav.push({ date, dwjz, zzzl });
        while (nav.length > 300) nav.shift();
        updated++;
      }
      f.navHistory = nav;
      f.navCount = nav.length;
    } catch (e) {
      console.error(`✗ ${f.code}: ${e.message}`);
    }
  }
  FD.updated = new Date().toISOString().slice(0, 10);
  fs.writeFileSync('funds.js', 'window.FUND_DATA = ' + JSON.stringify(FD, null, 0) + ';\n');
  console.log(`基金净值刷新完成，新增 ${updated} 只基金的最新一日数据。`);
})();
