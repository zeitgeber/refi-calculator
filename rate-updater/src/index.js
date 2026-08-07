const source = "https://www.freddiemac.com/pmms";
const parse = (text) => {
  const rows = [...text.matchAll(/(\d{1,2}\/\d{1,2}\/\d{4})[^\n]*?(\d\.\d+)[^\n]*?(\d\.\d+)/g)];
  const last = rows.at(-1);
  if (!last) throw new Error("PMMS rows not found");
  const [, date, thirtyYear, fifteenYear] = last;
  if (![thirtyYear, fifteenYear].every((n) => Number(n) >= 3 && Number(n) <= 15)) throw new Error("PMMS values invalid");
  return { date, thirtyYear: Number(thirtyYear), fifteenYear: Number(fifteenYear), source: "https://www.freddiemac.com/pmms", updatedAt: new Date().toISOString() };
};
export default {
  async scheduled(_, env) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`PMMS fetch failed: ${response.status}`);
    const data = parse(await response.text());
    await env.RATES.put("freddie-pmms.json", JSON.stringify(data), { httpMetadata: { contentType: "application/json", cacheControl: "public, max-age=3600" } });
  }
};
