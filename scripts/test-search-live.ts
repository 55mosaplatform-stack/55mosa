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
    "shoes",
    "shop",
  ];

  for (const q of queries) {
    try {
      const res = await fetch(`https://55mosa.com/api/businesses?search=${encodeURIComponent(q)}`);
      const data = await res.json();
      const count = data.businesses?.length || 0;
      const top = data.businesses?.[0]?.name || "None";
      console.log(`Query: "${q}" -> Results: ${count} (Top: ${top})`);
    } catch (e: any) {
      console.error(`Error on "${q}":`, e.message);
    }
  }
}

testSearch();
