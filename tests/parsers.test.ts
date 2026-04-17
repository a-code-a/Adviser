import { describe, expect, it } from "vitest";

import { listingAnalysisSchema } from "../lib/core/analysis";
import { ensureMarketplaceUrl } from "../lib/core/marketplaces";
import { parseEbayHtml } from "../worker/src/adapters/ebay";
import { parseKleinanzeigenHtml } from "../worker/src/adapters/kleinanzeigen";

const ebayFixture = `
<!doctype html>
<html>
  <head>
    <title>Vintage Camera on eBay</title>
    <meta property="og:title" content="Vintage Camera" />
    <meta property="og:image" content="https://images.example.com/camera-1.jpg" />
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Vintage Camera",
        "description": "Well-kept analog camera with original strap.",
        "image": [
          "https://images.example.com/camera-1.jpg",
          "https://images.example.com/camera-2.jpg"
        ],
        "offers": {
          "@type": "Offer",
          "price": "349.00",
          "priceCurrency": "EUR",
          "availability": "InStock",
          "itemCondition": "UsedCondition",
          "seller": {
            "@type": "Organization",
            "name": "Analogue Shop"
          }
        }
      }
    </script>
  </head>
  <body>
    <nav aria-label="Breadcrumb">
      <li>Elektronik</li>
      <li>Kameras</li>
    </nav>
  </body>
</html>
`;

const kleinanzeigenFixture = `
<!doctype html>
<html>
  <head>
    <title>Brompton Faltrad</title>
    <meta property="og:image" content="https://images.example.com/brompton.jpg" />
    <script id="__NEXT_DATA__" type="application/json">
      {
        "props": {
          "pageProps": {
            "ad": {
              "adId": 123456789,
              "title": "Brompton Faltrad",
              "description": "Sehr gepflegtes Fahrrad, kaum Gebrauchsspuren.",
              "price": {
                "amount": 1400
              },
              "location": {
                "name": "Berlin"
              },
              "condition": "Gebraucht",
              "images": [
                { "url": "https://images.example.com/brompton.jpg" }
              ],
              "seller": {
                "id": 88,
                "name": "M. Schneider",
                "rating": 4.8,
                "ratingCount": 21,
                "memberSince": "2019",
                "badges": [
                  { "label": "Freundlich" }
                ]
              }
            }
          }
        }
      }
    </script>
  </head>
  <body>
    <h1>Brompton Faltrad</h1>
  </body>
</html>
`;

describe("marketplace normalization", () => {
  it("detects and normalizes supported URLs", () => {
    const ebay = ensureMarketplaceUrl("https://www.ebay.de/itm/123456789012?_trkparms=test");
    const kleinanzeigen = ensureMarketplaceUrl(
      "https://www.kleinanzeigen.de/s-anzeige/brompton-faltrad/123456789-217-1234"
    );

    expect(ebay.marketplace).toBe("ebay");
    expect(ebay.normalizedUrl).not.toContain("_trkparms");
    expect(kleinanzeigen.marketplace).toBe("kleinanzeigen");
  });
});

describe("HTML parsers", () => {
  it("parses eBay listing HTML into normalized data", () => {
    const result = parseEbayHtml(ebayFixture, "https://www.ebay.de/itm/123456789012");

    expect(result.listing.marketplace).toBe("ebay");
    expect(result.listing.title).toBe("Vintage Camera");
    expect(result.listing.priceAmount).toBe(349);
    expect(result.images).toHaveLength(2);
    expect(result.seller.name).toBe("Analogue Shop");
  });

  it("parses Kleinanzeigen listing HTML into normalized data", () => {
    const result = parseKleinanzeigenHtml(
      kleinanzeigenFixture,
      "https://www.kleinanzeigen.de/s-anzeige/brompton-faltrad/123456789-217-1234"
    );

    expect(result.listing.marketplace).toBe("kleinanzeigen");
    expect(result.listing.title).toBe("Brompton Faltrad");
    expect(result.listing.priceAmount).toBe(1400);
    expect(result.seller.ratingScore).toBe(4.8);
    expect(result.images[0]?.url).toContain("brompton");
  });
});

describe("analysis schema", () => {
  it("accepts a strict structured report", () => {
    const parsed = listingAnalysisSchema.parse({
      citations: [{ label: "Market listing", url: "https://example.com/a" }],
      comparableItems: [
        {
          condition: "used",
          currency: "EUR",
          marketplace: "ebay",
          priceAmount: 320,
          reason: "Similar condition and same category.",
          title: "Comparable",
          url: "https://example.com/b"
        }
      ],
      confidence: 0.82,
      estimatedFairRange: {
        currency: "EUR",
        max: 350,
        min: 300
      },
      priceVerdict: "fair",
      questionsToAsk: ["Any defects or repairs?"],
      redFlags: ["No invoice mentioned."],
      riskScore: 41,
      sellerAssessment: "Seller profile looks decent but not deeply verified.",
      summary: "The listing is roughly aligned with recent comparables.",
      thingsToCheck: ["Request close-up photos of the wear areas."]
    });

    expect(parsed.priceVerdict).toBe("fair");
    expect(parsed.estimatedFairRange.max).toBe(350);
  });
});
