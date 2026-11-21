async function testMetadata() {
  const res = await fetch("https://55mosa.com", { cache: "no-store" });
  const html = await res.text();

  const hasCanonical = html.includes('rel="canonical"') && html.includes("https://55mosa.com");
  const hasJsonLd = html.includes("application/ld+json");
  const hasSearchAction = html.includes("SearchAction");
  const hasOrg = html.includes("Organization");

  console.log("Canonical Tag Present:", hasCanonical);
  console.log("JSON-LD Schema Present:", hasJsonLd);
  console.log("SearchAction Schema Present:", hasSearchAction);
  console.log("Organization Schema Present:", hasOrg);
}

testMetadata();
