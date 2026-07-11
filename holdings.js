/* =========================================================
   持仓种子：A股（来自用户真实账户，数据见 ~/.workbuddy/MEMORY.md）
   - 基金部分直接复用 funds.js（window.FUND_DATA.funds）
   - 这里只补 A股（东方财富账户），运行时由浏览器抓取历史行情
   字段说明：
     isStock:true  标记为股票（基金无此字段）
     bench         分时/历史行情的 eastmoney secid
     shares/costPrice  用于按股数计算市值与盈亏
     price         现价（同步时刷新）
   ========================================================= */
window.ASHARE_SEED = [
  {
    code:"000100", name:"TCL科技", short:"TCL科技",
    type:"股票-A股", sector:"科技/面板", bench:"0.000100",
    isStock:true, source:"东方财富",
    shares:6900, costPrice:4.721, price:4.67,
    amount:6900*4.67, costAmount:6900*4.721
  },
  {
    code:"002384", name:"东山精密", short:"东山精密",
    type:"股票-A股", sector:"电子/精密制造", bench:"0.002384",
    isStock:true, source:"东方财富",
    shares:400, costPrice:226.394, price:212.27,
    amount:400*212.27, costAmount:400*226.394
  },
  {
    code:"603319", name:"美湖股份", short:"美湖股份",
    type:"股票-A股", sector:"汽车/零部件", bench:"1.603319",
    isStock:true, source:"东方财富",
    shares:1800, costPrice:42.318, price:33.57,
    amount:1800*33.57, costAmount:1800*42.318
  }
];
