const $ = (id) => document.getElementById(id);
const money = (n) => (Number.isFinite(n) ? n : 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (n) => `${(n * 100).toFixed(2)}%`;
const parseMoney = (v) => Number(String(v).replace(/[^\d.-]/g, "")) || 0;
const formatMoneyInput = (el) => el.value = money(parseMoney(el.value));
const monthName = (i) => ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i % 12];
const breakEvenLabel = (v, month) => {
  if (!month) return "Not found";
  const i = monthNow() + month;
  return `${month} months (${monthName(i)} ${Math.floor(i / 12)})`;
};
const monthNow = () => {
  const d = new Date();
  return d.getFullYear() * 12 + d.getMonth();
};
const payment = (principal, annualRate, months) => {
  if (principal <= 0 || months <= 0) return 0;
  const r = annualRate / 12;
  return r === 0 ? principal / months : principal * r * (1 + r) ** months / ((1 + r) ** months - 1);
};
const balanceAfter = (principal, annualRate, months, monthlyPayment) => {
  if (principal <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return Math.max(0, principal - monthlyPayment * months);
  return Math.max(0, principal * (1 + r) ** months - monthlyPayment * (((1 + r) ** months - 1) / r));
};
const read = () => {
  const f = new FormData($("inputs"));
  const v = Object.fromEntries([...f].map(([k, x]) => [k, Number(x) || x]));
  v.homeValue = parseMoney(f.get("homeValue"));
  v.balance = parseMoney(f.get("balance"));
  v.closingCosts = v.homeValue * (Number(f.get("closingCostPct")) || 0) / 100;
  v.currentRate /= 100;
  v.newRate /= 100;
  v.rolledCosts = f.has("rolledCosts");
  v.elapsedMonths = Math.max(0, monthNow() - (v.startYear * 12 + v.startMonth));
  v.remainingMonths = Math.max(1, v.currentTerm * 12 - v.elapsedMonths);
  v.horizonMonths = Math.max(1, v.stayYears * 12);
  return v;
};
const scenario = (v, rate = v.newRate, costs = v.closingCosts, months = v.horizonMonths) => {
  const currentPay = payment(v.balance, v.currentRate, v.remainingMonths);
  const refiPrincipal = v.balance + (v.rolledCosts ? costs : 0);
  const refiPay = payment(refiPrincipal, rate, v.newTerm * 12);
  const upfront = v.rolledCosts ? 0 : costs;
  let breakEven = null;
  const yearly = [];
  let atHorizon = 0;
  for (let m = 1; m <= Math.max(months, v.newTerm * 12, 360); m++) {
    const currentBal = balanceAfter(v.balance, v.currentRate, Math.min(m, v.remainingMonths), currentPay);
    const refiBal = balanceAfter(refiPrincipal, rate, Math.min(m, v.newTerm * 12), refiPay);
    const savings = currentPay * Math.min(m, v.remainingMonths) + currentBal - (upfront + refiPay * Math.min(m, v.newTerm * 12) + refiBal);
    if (breakEven === null && savings >= 0) breakEven = m;
    if (m === months) atHorizon = savings;
    if (m % 12 === 0 && m <= months) yearly.push({
      year: m / 12,
      currentPayments: currentPay * Math.min(m, v.remainingMonths),
      refiPayments: upfront + refiPay * Math.min(m, v.newTerm * 12),
      diff: currentPay * Math.min(m, v.remainingMonths) - (upfront + refiPay * Math.min(m, v.newTerm * 12)),
      currentBal,
      refiBal,
      savings
    });
  }
  const currentInterest = currentPay * v.remainingMonths - v.balance;
  const refiInterest = refiPay * v.newTerm * 12 - refiPrincipal + upfront;
  return { currentPay, refiPay, upfront, refiPrincipal, breakEven, yearly, atHorizon, currentInterest, refiInterest, lifetimeSavings: currentInterest - refiInterest };
};
const bestRate = (v, ok) => {
  let lo = .001, hi = .15;
  if (!ok(scenario(v, lo))) return null;
  if (ok(scenario(v, hi))) return hi;
  for (let i = 0; i < 42; i++) {
    const mid = (lo + hi) / 2;
    if (ok(scenario(v, mid))) lo = mid;
    else hi = mid;
  }
  return lo;
};
const wrapText = (x, text, left, top, maxWidth, lineHeight) => {
  let line = "";
  String(text).split(" ").forEach((word) => {
    const test = `${line}${word} `;
    if (x.measureText(test).width > maxWidth && line) {
      x.fillText(line, left, top);
      line = `${word} `;
      top += lineHeight;
    } else {
      line = test;
    }
  });
  x.fillText(line, left, top);
  return top + lineHeight;
};
const renderCard = (v, s, badge) => {
  const c = $("shareCanvas"), x = c.getContext("2d");
  const rate = bestRate(v, (r) => r.breakEven && r.breakEven <= 24);
  const gradient = x.createLinearGradient(0, 0, c.width, c.height);
  gradient.addColorStop(0, "#fff3b0");
  gradient.addColorStop(.48, "#5eead4");
  gradient.addColorStop(1, "#f472b6");
  x.fillStyle = gradient; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = "rgba(255,255,255,.78)"; x.fillRect(34, 34, c.width - 68, c.height - 68);
  x.fillStyle = "#17201d"; x.font = "800 32px sans-serif"; x.fillText("Refi Reckoner", 64, 84);
  x.fillStyle = "#ec4899"; x.beginPath(); x.arc(785, 88, 42, 0, Math.PI * 2); x.fill();
  x.fillStyle = "#17201d"; x.font = "900 44px sans-serif";
  const y = wrapText(x, badge, 64, 155, 710, 50);
  x.fillStyle = "#0f766e"; x.fillRect(64, y + 8, 210 + Math.max(0, s.atHorizon / 200), 18);
  x.fillStyle = "#17201d"; x.font = "700 32px sans-serif";
  x.fillText(`Break-even: ${breakEvenLabel(v, s.breakEven)}`, 64, y + 76);
  x.fillText(`${v.stayYears}-year savings: ${money(s.atHorizon)}`, 64, y + 126);
  x.fillText(`Current rate: ${pct(v.currentRate)}`, 64, y + 176);
  x.fillText(`Remaining balance: ${money(v.balance)}`, 64, y + 226);
  x.fillText(`2-year target rate: ${rate ? pct(rate) : "not reachable"}`, 64, y + 276);
};
const render = () => {
  const v = read();
  const s = scenario(v);
  $("closingCostDollars").textContent = `${money(v.closingCosts)} estimated from home value`;
  const drop = s.currentPay - s.refiPay;
  const trap = drop > 0 && s.lifetimeSavings < 0;
  const worth = s.atHorizon > 0 && s.breakEven && s.breakEven <= v.horizonMonths;
  const fast = s.breakEven && s.breakEven <= 24;
  const badge = trap ? "Payment Drop, Cost Increase" : fast ? "Two-Year Break-Even Achieved" : worth ? "Worth a Quote" : s.atHorizon > 0 ? "Barely Worth It" : "Not Yet";
  $("summary").className = `verdict ${trap || !worth ? "warn" : ""} ${s.atHorizon < 0 ? "bad" : ""}`;
  $("summary").innerHTML = `<span class="badge">${badge}</span><h2>Refinance verdict</h2><p class="big">${money(s.atHorizon)}</p><p>Your new payment would be <strong>${money(Math.abs(drop))}/month ${drop >= 0 ? "lower" : "higher"}</strong>. Estimated closing costs are <strong>${money(v.closingCosts)}</strong>. You break even in <strong>${breakEvenLabel(v, s.breakEven)}</strong>. If you stay ${v.stayYears} years, estimated savings are <strong>${money(s.atHorizon)}</strong>.</p>${trap ? "<p><strong>Warning:</strong> the payment drops, but lifetime cost rises. That is usually the loan-term reset talking.</p>" : ""}`;
  const twoYearRate = bestRate(v, (r) => r.breakEven && r.breakEven <= 24);
  $("metrics").innerHTML = [
    ["Current payment", money(s.currentPay)],
    ["Refi payment", money(s.refiPay)],
    ["Monthly difference", money(drop)],
    ["Break-even month", breakEvenLabel(v, s.breakEven)],
    ["2-year break-even rate", twoYearRate ? pct(twoYearRate) : "Not reachable"],
    ["Interest remaining now", money(s.currentInterest)],
    ["Interest under refinance", money(s.refiInterest)],
    ["Lifetime interest savings", money(s.lifetimeSavings)]
  ].map(([a, b]) => `<div class="metric"><span>${a}</span><strong>${b}</strong></div>`).join("");
  $("yearRows").innerHTML = s.yearly.map(r => `<tr><td>${r.year}</td><td>${money(r.currentPayments)}</td><td>${money(r.refiPayments)}</td><td>${money(r.diff)}</td><td>${money(r.currentBal)}</td><td>${money(r.refiBal)}</td><td>${money(r.savings)}</td></tr>`).join("");

  const targetSavings = parseMoney($("targetSavings").value);
  const targetYears = Number($("targetYears").value) || v.stayYears;
  const targetRate = bestRate({ ...v, horizonMonths: targetYears * 12 }, (r) => r.atHorizon >= targetSavings);
  $("targetResult").innerHTML = targetRate ? `To save at least <strong>${money(targetSavings)} over ${targetYears} years</strong>, you need about <strong>${pct(targetRate)} or lower</strong>.` : "That target is not reachable with these inputs.";
  const targetMonths = Number($("targetMonths").value) || 24;
  const breakRate = bestRate(v, (r) => r.breakEven && r.breakEven <= targetMonths);
  $("breakEvenRateResult").innerHTML = breakRate ? `Highest refinance rate for a <strong>${targetMonths}-month</strong> break-even: <strong>${pct(breakRate)}</strong>.` : "No rate in the tested range hits that break-even.";
  const feeParts = ["appraisal", "titleFees", "lenderFees", "prepaids"].map(id => parseMoney($(id).value));
  const detailedCosts = feeParts.reduce((a, b) => a + b, 0);
  const noCost24 = scenario({ ...v, rolledCosts: false }, v.newRate, 0, 24).atHorizon;
  $("costResult").innerHTML = `Detailed fees total <strong>${money(detailedCosts)}</strong>. At this rate, closing costs need to stay below <strong>${money(Math.max(0, noCost24))}</strong> to break even within 2 years.`;
  $("stayResult").innerHTML = s.breakEven && s.breakEven <= v.horizonMonths ? `You stay long enough. Break-even is <strong>${breakEvenLabel(v, s.breakEven)}</strong>.` : `You break even in <strong>${breakEvenLabel(v, s.breakEven)}</strong>. Moving or refinancing first likely loses money.`;

  const returnRate = (Number($("returnRate").value) || 0) / 100 / 12;
  const monthlyInvest = Math.max(0, drop);
  let investedRows = "";
  for (let y = 1; y <= v.stayYears; y++) {
    const m = y * 12;
    const fv = returnRate === 0 ? monthlyInvest * m : monthlyInvest * (((1 + returnRate) ** m - 1) / returnRate);
    const net = fv - s.upfront;
    investedRows += `<tr><td>${y}</td><td>${money(monthlyInvest * m)}</td><td>${money(fv)}</td><td>${money(Math.max(0, s.upfront - fv))}</td><td>${money(net)}</td></tr>`;
  }
  $("investRows").innerHTML = investedRows;
  const fvEnd = returnRate === 0 ? monthlyInvest * v.horizonMonths : monthlyInvest * (((1 + returnRate) ** v.horizonMonths - 1) / returnRate);
  $("investResult").innerHTML = `Investing ${money(monthlyInvest)}/month could become <strong>${money(fvEnd)}</strong>. Net of upfront closing costs: <strong>${money(fvEnd - s.upfront)}</strong>.`;

  const desiredDrop = parseMoney($("targetReduction").value);
  const targetPay = s.currentPay - desiredDrop;
  const maxPrincipal = targetPay <= 0 ? 0 : targetPay / (payment(1, v.newRate, v.newTerm * 12) || 1);
  const cashIn = Math.max(0, v.balance - maxPrincipal);
  const available = parseMoney($("availableCash").value);
  $("cashInResult").innerHTML = cashIn <= 0 ? `This refinance already hits the target payment reduction.` : `To lower payment by <strong>${money(desiredDrop)}/month</strong>, cash-in needed is about <strong>${money(cashIn)}</strong>. New loan-to-value ratio, meaning loan balance divided by home value: <strong>${((maxPrincipal / v.homeValue) * 100).toFixed(1)}%</strong>. ${available >= cashIn ? "Your available cash covers it." : `Short by ${money(cashIn - available)}.`}`;
  const captions = [
    `The stars say: refinance below ${twoYearRate ? pct(twoYearRate) : "a lower rate"}. Closing costs are in retrograde.`,
    `Level: Homeowner. Enemy: ${(v.currentRate * 100).toFixed(2)}% mortgage. Loot: ${money(s.atHorizon)} estimated savings.`,
    `My mortgage said: "Lower monthly payment." The calculator said: "Show me the closing costs."`,
    `Estimated break-even: ${breakEvenLabel(v, s.breakEven)}. Estimated ${v.stayYears}-year savings: ${money(s.atHorizon)}.`
  ];
  $("shareText").textContent = captions[Math.abs(Math.round(s.atHorizon)) % captions.length];
  renderCard(v, s, badge);
};

$("inputs").addEventListener("input", render);
document.querySelectorAll(".money-input").forEach(el => {
  el.addEventListener("blur", () => { formatMoneyInput(el); render(); });
});
document.querySelectorAll("#targetSavings,#targetYears,#targetMonths,#appraisal,#titleFees,#lenderFees,#prepaids,#returnRate,#targetReduction,#availableCash").forEach(el => el.addEventListener("input", render));
$("stayChips").addEventListener("click", (e) => {
  if (e.target.dataset.years) {
    document.querySelector('[name="stayYears"]').value = e.target.dataset.years;
    render();
  }
});
$("downloadCard").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = $("shareCanvas").toDataURL("image/png");
  a.download = "refi-result.png";
  a.click();
});
new URLSearchParams(location.search).forEach((v, k) => {
  const el = document.querySelector(`[name="${k}"]`);
  if (el) el.type === "checkbox" ? el.checked = true : el.value = v;
});
document.querySelectorAll(".money-input").forEach(formatMoneyInput);
render();

// ponytail: tiny self-check; replace with Vitest only when a build tool exists.
console.assert(Math.round(payment(100000, .06, 360)) === 600, "payment formula");
console.assert(balanceAfter(100000, .06, 12, payment(100000, .06, 360)) < 99000, "balance amortizes");
