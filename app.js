const $ = (id) => document.getElementById(id);
const money = (n) => (Number.isFinite(n) ? n : 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (n) => `${(n * 100).toFixed(2)}%`;
const parseMoney = (v) => {
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const formatMoneyInput = (el) => {
  const value = parseMoney(el.value);
  if (Number.isFinite(value)) el.value = money(value);
};
const monthName = (i) => ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i % 12];
const monthNow = () => {
  const d = new Date();
  return d.getFullYear() * 12 + d.getMonth();
};
const duration = (months) => months % 12 === 0 ? `${months / 12} year${months === 12 ? "" : "s"}` : `${months} months`;
const breakEvenLabel = (month) => {
  if (!month) return "Not found";
  const i = monthNow() + month;
  return `${month} months (${monthName(i)} ${Math.floor(i / 12)})`;
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
const numberField = (form, name, label, errors, { money: isMoney = false, min = 0, max = Infinity } = {}) => {
  const raw = form.get(name);
  const value = isMoney ? parseMoney(raw) : Number(raw);
  if (raw === null || String(raw).trim() === "" || !Number.isFinite(value) || value < min || value > max) {
    errors.push(`${label} must be a number from ${min}${Number.isFinite(max) ? ` to ${max}` : " or more"}.`);
  }
  return value;
};
const read = () => {
  const form = new FormData($("inputs"));
  const errors = [];
  const samePayoff = form.has("samePayoff");
  const v = {
    homeValue: numberField(form, "homeValue", "Home value", errors, { money: true, min: 1 }),
    currentRate: numberField(form, "currentRate", "Current loan rate", errors, { min: 0, max: 100 }) / 100,
    newRate: numberField(form, "newRate", "Refinance rate", errors, { min: 0, max: 100 }) / 100,
    currentTerm: numberField(form, "currentTerm", "Current loan term", errors, { min: 1, max: 50 }),
    newTerm: samePayoff ? 0 : numberField(form, "newTerm", "New refinance term", errors, { min: 1, max: 50 }),
    startMonth: numberField(form, "startMonth", "Loan start month", errors, { min: 0, max: 11 }),
    startYear: numberField(form, "startYear", "Loan start year", errors, { min: 1970, max: new Date().getFullYear() }),
    stayMonths: numberField(form, "stayMonths", "Expected time staying", errors, { min: 1, max: 600 }),
    closingCostPct: numberField(form, "closingCostPct", "Closing-cost estimate", errors, { min: 0, max: 20 }),
    balanceMode: form.get("balanceMode"),
    closingCostMode: form.get("closingCostMode"),
    rolledCosts: form.has("rolledCosts"),
    samePayoff
  };
  const start = v.startYear * 12 + v.startMonth;
  if (start > monthNow()) errors.push("Loan start cannot be in the future.");
  v.elapsedMonths = Math.max(0, monthNow() - start);
  v.remainingMonths = Math.max(1, v.currentTerm * 12 - v.elapsedMonths);
  v.newTermMonths = v.samePayoff ? v.remainingMonths : v.newTerm * 12;
  v.horizonMonths = v.stayMonths;
  v.stayYears = v.stayMonths / 12;
  if (v.balanceMode === "estimate") {
    const originalPrincipal = numberField(form, "originalPrincipal", "Original loan amount", errors, { money: true, min: 1 });
    const originalPayment = payment(originalPrincipal, v.currentRate, v.currentTerm * 12);
    v.balance = balanceAfter(originalPrincipal, v.currentRate, v.elapsedMonths, originalPayment);
  } else {
    v.balance = numberField(form, "balance", "Current loan balance", errors, { money: true, min: 1 });
  }
  const fees = ["appraisal", "titleFees", "lenderFees"].map((id) => parseMoney($(id).value));
  if ($("includePrepaids").checked) fees.push(parseMoney($("prepaids").value));
  const detailedCosts = fees.reduce((sum, fee) => sum + fee, 0);
  if (v.closingCostMode === "detailed" && fees.some((fee) => !Number.isFinite(fee) || fee < 0)) errors.push("Detailed closing costs must be valid dollar amounts.");
  v.currentPmi = parseMoney($("currentPmi").value);
  v.refiPmi = parseMoney($("refiPmi").value);
  if (!Number.isFinite(v.currentPmi) || v.currentPmi < 0 || !Number.isFinite(v.refiPmi) || v.refiPmi < 0) errors.push("Monthly mortgage insurance must be a valid dollar amount.");
  v.detailedCosts = detailedCosts;
  v.closingCosts = v.closingCostMode === "detailed" ? detailedCosts : v.homeValue * v.closingCostPct / 100;
  return { v, errors };
};
const scenario = (v, rate = v.newRate, costs = v.closingCosts, months = v.horizonMonths) => {
  const currentPiPay = payment(v.balance, v.currentRate, v.remainingMonths);
  const refiPrincipal = v.balance + (v.rolledCosts ? costs : 0);
  const refiPiPay = payment(refiPrincipal, rate, v.newTermMonths);
  const currentPay = currentPiPay + v.currentPmi;
  const refiPay = refiPiPay + v.refiPmi;
  const upfront = v.rolledCosts ? 0 : costs;
  let breakEven = null;
  const yearly = [];
  let atHorizon = 0;
  for (let m = 1; m <= Math.max(months, v.newTermMonths, v.remainingMonths); m++) {
    const currentBal = balanceAfter(v.balance, v.currentRate, Math.min(m, v.remainingMonths), currentPiPay);
    const refiBal = balanceAfter(refiPrincipal, rate, Math.min(m, v.newTermMonths), refiPiPay);
    const currentPaid = currentPay * Math.min(m, v.remainingMonths);
    const refiPaid = upfront + refiPay * Math.min(m, v.newTermMonths);
    const netPosition = currentPaid + currentBal - (refiPaid + refiBal);
    if (breakEven === null && netPosition >= 0) breakEven = m;
    if (m === months) atHorizon = netPosition;
    if ((m % 12 === 0 || m === months) && m <= months) yearly.push({ year: duration(m), currentPayments: currentPaid, refiPayments: refiPaid, diff: currentPaid - refiPaid, currentBal, refiBal, netPosition });
  }
  const currentInterest = currentPiPay * v.remainingMonths - v.balance;
  const refiInterest = refiPiPay * v.newTermMonths - refiPrincipal;
  const currentTotalCost = currentInterest + v.currentPmi * v.remainingMonths;
  const totalRefiCost = refiInterest + costs + v.refiPmi * v.newTermMonths;
  return {
    currentPay, refiPay, upfront, refiPrincipal, breakEven, yearly, atHorizon, currentInterest, refiInterest,
    totalRefiCost, lifetimeCostAdvantage: currentTotalCost - totalRefiCost,
    paymentOnlyDifference: currentPay * Math.min(months, v.remainingMonths) - refiPay * Math.min(months, v.newTermMonths)
  };
};
const bestRate = (v, ok) => {
  let lo = 0.001, hi = 0.15;
  if (!ok(scenario(v, lo))) return null;
  if (ok(scenario(v, hi))) return hi;
  for (let i = 0; i < 42; i++) {
    const mid = (lo + hi) / 2;
    if (ok(scenario(v, mid))) lo = mid;
    else hi = mid;
  }
  return lo;
};
const maxUpfrontCosts = (v, months) => {
  let lo = 0, hi = Math.max(v.homeValue, 100000);
  for (let i = 0; i < 42; i++) {
    const mid = (lo + hi) / 2;
    if (scenario({ ...v, rolledCosts: false }, v.newRate, mid, months).atHorizon >= 0) lo = mid;
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
    } else line = test;
  });
  x.fillText(line, left, top);
  return top + lineHeight;
};
const renderCard = (v, s, badge, twoYearRate) => {
  const c = $("shareCanvas"), x = c.getContext("2d");
  const gradient = x.createLinearGradient(0, 0, c.width, c.height);
  gradient.addColorStop(0, "#fff3b0"); gradient.addColorStop(0.48, "#5eead4"); gradient.addColorStop(1, "#f472b6");
  x.fillStyle = gradient; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = "rgba(255,255,255,.78)"; x.fillRect(34, 34, c.width - 68, c.height - 68);
  x.fillStyle = "#17201d"; x.font = "800 32px sans-serif"; x.fillText("Refi Reckoner", 64, 84);
  x.fillStyle = "#ec4899"; x.beginPath(); x.arc(785, 88, 42, 0, Math.PI * 2); x.fill();
  x.fillStyle = "#17201d"; x.font = "900 44px sans-serif";
  const y = wrapText(x, badge, 64, 155, 710, 50);
  x.fillStyle = "#0f766e"; x.fillRect(64, y + 8, Math.min(650, 210 + Math.max(0, s.atHorizon / 200)), 18);
  x.fillStyle = "#17201d"; x.font = "700 32px sans-serif";
  x.fillText(`Break-even: ${breakEvenLabel(s.breakEven)}`, 64, y + 76);
  x.fillText(`${duration(v.horizonMonths)} benefit: ${money(s.atHorizon)}`, 64, y + 126);
  x.fillText(`Current rate: ${pct(v.currentRate)}`, 64, y + 176);
  x.fillText(`Remaining balance: ${money(v.balance)}`, 64, y + 226);
  x.fillText(`2-year target rate: ${twoYearRate ? pct(twoYearRate) : "not reachable"}`, 64, y + 276);
};
const row = (label, value) => `<td data-label="${label}">${value}</td>`;
const render = () => {
  syncInputs();
  const { v, errors } = read();
  $("inputError").hidden = errors.length === 0;
  $("inputError").textContent = errors[0] || "";
  if (errors.length) {
    $("summary").className = "verdict warn";
    $("summary").innerHTML = "<h2>Finish the inputs to see a refinance verdict</h2><p>We will not assume a missing value is $0 or 0%.</p>";
    $("metrics").innerHTML = ""; $("yearRows").innerHTML = ""; $("investRows").innerHTML = "";
    return;
  }
  const s = scenario(v);
  const ltv = v.balance / v.homeValue;
  const drop = s.currentPay - s.refiPay;
  const trap = drop > 0 && s.lifetimeCostAdvantage < 0;
  const worth = s.atHorizon > 0 && s.breakEven && s.breakEven <= v.horizonMonths;
  const fast = s.breakEven && s.breakEven <= 24;
  const badge = trap ? "Payment Drop, Cost Increase" : fast ? "Two-Year Break-Even Achieved" : worth ? "Worth a Quote" : s.atHorizon > 0 ? "Barely Worth It" : "Not Yet";
  const twoYearRate = bestRate(v, (r) => r.breakEven && r.breakEven <= 24);
  $("closingCostDollars").textContent = v.closingCostMode === "detailed" ? `${money(v.closingCosts)} from detailed fees` : `${money(v.closingCosts)} estimated from home value`;
  const warnings = [
    trap && "The lower payment is outweighed by higher lifetime cost.",
    s.breakEven && s.breakEven > v.horizonMonths && `Break-even is after your expected ${duration(v.horizonMonths)} stay.`,
    v.newTermMonths > v.remainingMonths && "The refinance resets your payoff date later.",
    ltv >= 0.8 && "LTV is 80% or higher; ask the lender whether mortgage insurance applies.",
    v.rolledCosts && "Closing costs are financed, so you will pay interest on them."
  ].filter(Boolean);
  $("summary").className = `verdict ${trap || !worth ? "warn" : ""} ${s.atHorizon < 0 ? "bad" : ""}`;
  $("summary").innerHTML = `<span class="badge">${badge}</span><h2>Refinance verdict</h2><p class="big">${money(s.atHorizon)}</p><p><strong>Net financial position after ${duration(v.horizonMonths)}</strong>: payments made plus remaining loan balance, including closing costs. Your new payment would be <strong>${money(Math.abs(drop))}/month ${drop >= 0 ? "lower" : "higher"}</strong>. You break even in <strong>${breakEvenLabel(s.breakEven)}</strong>.</p>${warnings.length ? `<ul class="warnings">${warnings.map((warning) => `<li>${warning}</li>`).join("")}</ul>` : ""}`;
  $("metrics").innerHTML = [
    ["Current payment incl. PMI", money(s.currentPay)], ["Refi payment incl. PMI", money(s.refiPay)],
    ["Monthly payment difference", money(drop)], ["Payment-only difference by horizon", money(s.paymentOnlyDifference)],
    ["Net financial position by horizon", money(s.atHorizon)], ["Break-even month", breakEvenLabel(s.breakEven)],
    ["Current LTV", `${(ltv * 100).toFixed(1)}%`], ["2-year break-even rate", twoYearRate ? pct(twoYearRate) : "Not reachable"],
    ["Interest remaining now", money(s.currentInterest)], ["Refi loan interest", money(s.refiInterest)],
    ["Refi closing costs", money(v.closingCosts)], ["Lifetime total-cost advantage", money(s.lifetimeCostAdvantage)]
  ].map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join("");
  $("yearRows").innerHTML = s.yearly.map((r) => `<tr>${row("Period", r.year)}${row("Current payments", money(r.currentPayments))}${row("Refi payments", money(r.refiPayments))}${row("Payment difference", money(r.diff))}${row("Current balance", money(r.currentBal))}${row("Refi balance", money(r.refiBal))}${row("Net financial position", money(r.netPosition))}</tr>`).join("");

  const targetSavings = parseMoney($("targetSavings").value);
  const targetYears = Number($("targetYears").value);
  const targetRate = Number.isFinite(targetSavings) && targetSavings >= 0 && Number.isFinite(targetYears) && targetYears > 0 ? bestRate({ ...v, horizonMonths: targetYears * 12 }, (r) => r.atHorizon >= targetSavings) : null;
  $("targetResult").innerHTML = targetRate ? `To gain at least <strong>${money(targetSavings)} in net financial position over ${targetYears} years</strong>, you need about <strong>${pct(targetRate)} or lower</strong>.` : "Enter a valid savings target and timeline.";
  const targetMonths = Number($("targetMonths").value);
  const breakRate = Number.isFinite(targetMonths) && targetMonths > 0 ? bestRate(v, (r) => r.breakEven && r.breakEven <= targetMonths) : null;
  $("breakEvenRateResult").innerHTML = breakRate ? `Highest refinance rate for a <strong>${targetMonths}-month</strong> break-even: <strong>${pct(breakRate)}</strong>.` : "Enter a valid break-even target.";
  const maximumCosts = maxUpfrontCosts(v, 24);
  $("costResult").innerHTML = `Detailed fees total <strong>${money(v.detailedCosts)}</strong>. At this rate, upfront closing costs can reach about <strong>${money(maximumCosts)}</strong> and still break even within 2 years.`;
  $("stayResult").innerHTML = s.breakEven && s.breakEven <= v.horizonMonths ? `You stay long enough. Break-even is <strong>${breakEvenLabel(s.breakEven)}</strong>.` : `You break even in <strong>${breakEvenLabel(s.breakEven)}</strong>. Moving or refinancing first likely loses money.`;

  const annualReturn = Number($("returnRate").value);
  if (!Number.isFinite(annualReturn)) {
    $("investResult").textContent = "Enter a valid annual return to model invested savings.";
    $("investRows").innerHTML = "";
  }
  const returnRate = Number.isFinite(annualReturn) ? annualReturn / 100 / 12 : 0;
  const monthlyInvest = Math.max(0, drop);
  const milestones = [...new Set([...Array(Math.floor(v.horizonMonths / 12)).keys()].map((year) => (year + 1) * 12).concat(v.horizonMonths))];
  $("investRows").innerHTML = Number.isFinite(annualReturn) ? milestones.map((m) => {
    const fv = returnRate === 0 ? monthlyInvest * m : monthlyInvest * (((1 + returnRate) ** m - 1) / returnRate);
    return `<tr>${row("Period", duration(m))}${row("Invested", money(monthlyInvest * m))}${row("Investment value", money(fv))}${row("Costs remaining", money(Math.max(0, s.upfront - fv)))}${row("Net advantage", money(fv - s.upfront))}</tr>`;
  }).join("") : "";
  const fvEnd = returnRate === 0 ? monthlyInvest * v.horizonMonths : monthlyInvest * (((1 + returnRate) ** v.horizonMonths - 1) / returnRate);
  if (Number.isFinite(annualReturn)) $("investResult").innerHTML = `Investing ${money(monthlyInvest)}/month could become <strong>${money(fvEnd)}</strong>. Net of upfront closing costs: <strong>${money(fvEnd - s.upfront)}</strong>.`;

  const desiredDrop = parseMoney($("targetReduction").value);
  const targetPay = s.currentPay - desiredDrop - v.refiPmi;
  const maxPrincipal = Number.isFinite(desiredDrop) && targetPay > 0 ? targetPay / (payment(1, v.newRate, v.newTermMonths) || 1) : 0;
  const cashIn = Number.isFinite(desiredDrop) ? Math.max(0, v.balance - maxPrincipal) : NaN;
  const available = parseMoney($("availableCash").value);
  $("cashInResult").innerHTML = !Number.isFinite(cashIn) ? "Enter a valid target payment reduction." : cashIn <= 0 ? "This refinance already hits the target payment reduction." : `To lower payment by <strong>${money(desiredDrop)}/month</strong>, cash-in needed is about <strong>${money(cashIn)}</strong>. New LTV, meaning loan balance divided by home value, would be <strong>${((maxPrincipal / v.homeValue) * 100).toFixed(1)}%</strong>. ${Number.isFinite(available) && available >= cashIn ? "Your available cash covers it." : Number.isFinite(available) ? `Short by ${money(cashIn - available)}.` : "Enter available cash to compare it."}`;
  const recastBalance = Math.max(0, v.balance - v.closingCosts);
  const recastPayment = payment(recastBalance, v.currentRate, v.remainingMonths);
  $("principalAlternative").innerHTML = `Putting <strong>${money(v.closingCosts)}</strong> toward your current principal instead would reduce a recast payment to about <strong>${money(recastPayment)}/month</strong>. Without a lender-approved recast, the payment usually stays the same and the loan pays off earlier.`;
  const cashOut = parseMoney($("cashOut").value);
  const cashOutPrincipal = s.refiPrincipal + (Number.isFinite(cashOut) ? Math.max(0, cashOut) : 0);
  const cashOutPayment = payment(cashOutPrincipal, v.newRate, v.newTermMonths) + v.refiPmi;
  $("cashOutResult").innerHTML = cashOut > 0 ? `Taking <strong>${money(cashOut)}</strong> would make the new payment about <strong>${money(cashOutPayment)}/month</strong> and new LTV <strong>${((cashOutPrincipal / v.homeValue) * 100).toFixed(1)}%</strong>.` : "Enter cash to take out to see the payment and LTV impact.";

  const captions = [`The stars say: refinance below ${twoYearRate ? pct(twoYearRate) : "a lower rate"}. Closing costs are in retrograde.`, `Level: Homeowner. Enemy: ${pct(v.currentRate)} mortgage. Loot: ${money(s.atHorizon)} net financial benefit.`, "My mortgage said: \"Lower monthly payment.\" The calculator said: \"Show me the closing costs.\"", `Estimated break-even: ${breakEvenLabel(s.breakEven)}. Estimated ${duration(v.horizonMonths)} benefit: ${money(s.atHorizon)}.`];
  $("shareText").textContent = captions[Math.abs(Math.round(s.atHorizon)) % captions.length];
  renderCard(v, s, badge, twoYearRate);
  saveState();
};
const stateSelector = '#inputs [name], #targetSavings, #targetYears, #targetMonths, #appraisal, #titleFees, #lenderFees, #prepaids, #includePrepaids, #returnRate, #targetReduction, #availableCash, #cashOut, #currentPmi, #refiPmi';
const syncInputs = () => {
  const estimated = $("inputs").elements.balanceMode.value === "estimate";
  $("knownBalance").hidden = estimated;
  $("estimatedBalance").hidden = !estimated;
  $("inputs").elements.newTerm.disabled = $("inputs").elements.samePayoff.checked;
  $("inputs").elements.startYear.max = new Date().getFullYear();
};
const saveState = () => {
  try {
    const state = {};
    document.querySelectorAll(stateSelector).forEach((el) => { state[el.name || el.id] = el.type === "checkbox" ? el.checked : el.value; });
    localStorage.setItem("refi-reckoner-scenario", JSON.stringify(state));
  } catch (_) { /* Local storage can be unavailable in privacy-restricted browsers. */ }
};
const restoreState = () => {
  try {
    const state = JSON.parse(localStorage.getItem("refi-reckoner-scenario") || "{}");
    Object.entries(state).forEach(([key, value]) => {
      const el = document.querySelector(`[name="${key}"], #${key}`);
      if (el) el.type === "checkbox" ? el.checked = Boolean(value) : el.value = value;
    });
  } catch (_) { /* Start with defaults when storage is unavailable or malformed. */ }
  new URLSearchParams(location.search).forEach((value, key) => {
    const el = document.querySelector(`[name="${key}"], #${key}`);
    if (el) el.type === "checkbox" ? el.checked = value === "true" : el.value = value;
  });
};
$("inputs").addEventListener("input", render);
document.querySelectorAll(stateSelector).forEach((el) => el.addEventListener("input", () => {
  if (["appraisal", "titleFees", "lenderFees", "prepaids", "includePrepaids"].includes(el.id)) $("inputs").elements.closingCostMode.value = "detailed";
  if (!el.closest("#inputs")) render();
}));
document.querySelectorAll(".money-input").forEach((el) => el.addEventListener("blur", () => { formatMoneyInput(el); render(); }));
$("stayChips").addEventListener("click", (event) => {
  if (event.target.dataset.years) {
    $("inputs").elements.stayMonths.value = Number(event.target.dataset.years) * 12;
    render();
  }
});
$("downloadCard").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = $("shareCanvas").toDataURL("image/png");
  a.download = "refi-result.png";
  a.click();
});
restoreState();
document.querySelectorAll(".money-input").forEach(formatMoneyInput);
render();

// ponytail: tiny self-check; replace with a test runner only when a build step exists.
console.assert(Math.round(payment(100000, 0.06, 360)) === 600, "payment formula");
console.assert(balanceAfter(100000, 0.06, 12, payment(100000, 0.06, 360)) < 99000, "balance amortizes");
