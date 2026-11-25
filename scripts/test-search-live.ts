async function testSearch() {
  const queries = [
    "perfume",
    "headsets",
    "retail shop",
    "kacyiru",
    "janvier",
    "perfume in kacyiru",
    "perfume shop",
    "perfume kacyiru",
    "headsets shop",
    "kacyiru shop",
    "art",
    "ishyuka",
    "remera",
    "art in remera",
    "sacco",
    "sweet love perfume",
    "shop"
  ];

  console.log("=== LIVE PRODUCTION SEARCH TEST (55mosa.com) ===");
  for (const q of queries) {
    try {
      const res = await fetch(`https://www.55mosa.com/api/businesses?search=${encodeURIComponent(q)}`);
      const data = await res.json();
      const count = data.businesses?.length || 0;
      const top = data.businesses?.[0]?.name || "None";
      const cat = data.businesses?.[0]?.category || "";
      console.log(`Query: "${q.padEnd(20)}" -> ${count} results | Top: ${top} (${cat})`);
    } catch (e: any) {
      console.error(`Error on "${q}":`, e.message);
    }
  }
}

testSearch();
