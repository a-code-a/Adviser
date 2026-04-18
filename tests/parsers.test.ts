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

const kleinanzeigenDomFixture = `
<!doctype html>
<html lang="de">
  <head>
    <title>Audi Q3 F3 2019 S-Line 45 TFSI 230Ps Quattro</title>
    <meta property="og:title" content="Audi Q3 F3 2019 S-Line 45 TFSI 230Ps Quattro" />
    <meta property="og:image" content="https://img.kleinanzeigen.de/api/v1/prod-ads/images/06/06400b46-a9f2-4807-b894-7f2b95ef5c67?rule=$_59.JPG" />
    <meta property="og:locality" content="71397 Leutenbach" />
    <script>
      window.BelenConf = {
        universalAnalyticsOpts: {
          dimensions: {
            ad_seller_type: "Private"
          }
        }
      };
      const config = { adCreationDate: "09.03.2026" };
      const poster = { posterid:"3934622" };
    </script>
  </head>
  <body>
    <div id="vap-brdcrmb">
      <a class="breadcrump-link"><span itemprop="name">Kleinanzeigen</span></a>
      <a class="breadcrump-link"><span itemprop="name">Auto, Rad &amp; Boot</span></a>
      <a class="breadcrump-link"><span itemprop="name">Autos</span></a>
    </div>

    <main>
      <article id="viewad-product">
        <div class="galleryimage-element current">
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "ImageObject",
              "title": "Audi Q3 F3 2019 S-Line 45 TFSI 230Ps Quattro",
              "description": "Audi Q3 F3 S-Line 45 TFSI\\n\\nHubraum: 1984 cm³\\nHU: 2/2027\\nFarbe: Schwarz\\nInnenausstattung: Alcantara\\nAnzahl der Fahrzeughalter: 2",
              "contentUrl": "https://img.kleinanzeigen.de/api/v1/prod-ads/images/06/06400b46-a9f2-4807-b894-7f2b95ef5c67?rule=$_59.JPG"
            }
          </script>
          <img
            alt="Audi Q3 Vorschau"
            data-imgsrc="https://img.kleinanzeigen.de/api/v1/prod-ads/images/30/3008ef51-97b4-4a54-9cbb-199f3bcfe8d5?rule=$_57.AUTO"
          />
        </div>
      </article>

      <section>
        <h1 id="viewad-title">Audi Q3 F3 2019 S-Line 45 TFSI 230Ps Quattro</h1>
        <div id="viewad-price">28.000 € VB</div>
        <div id="viewad-locality">71397 Leutenbach</div>
        <div id="viewad-extra-info">09.03.2026</div>

        <div id="viewad-details">
          <div class="addetailslist--detail">
            <span class="addetailslist--detail--title">Kilometerstand</span>
            <span class="addetailslist--detail--value">89.500 km</span>
          </div>
          <div class="addetailslist--detail">
            <span class="addetailslist--detail--title">Erstzulassung</span>
            <span class="addetailslist--detail--value">03/2019</span>
          </div>
          <div class="addetailslist--detail">
            <span class="addetailslist--detail--title">Leistung</span>
            <span class="addetailslist--detail--value">230 PS</span>
          </div>
        </div>

        <div id="viewad-configuration">
          <span class="checktag">Allradantrieb</span>
          <span class="checktag">Apple CarPlay</span>
          <span class="checktag">Sitzheizung</span>
        </div>

        <div id="viewad-description-text">
          Gepflegter Audi Q3 aus zweiter Hand.<br />
          Besichtigung und Probefahrt nach Absprache möglich.
        </div>

        <aside id="viewad-profile-box">
          <h2>AP</h2>
          <a href="/s-bestandsliste.html?userId=3934622">Weitere Anzeigen</a>
          <span class="userbadge-tag">Freundlich</span>
          <span class="userbadge-tag">Zuverlässig</span>
          <p>Mitglied seit 2019</p>
          <p>Privatanbieter</p>
        </aside>
      </section>
    </main>
  </body>
</html>
`;

const kleinanzeigenPayloadMatchFixture = `
<!doctype html>
<html lang="de">
  <head>
    <title>Audi Q3 F3 2019 S-Line 45 TFSI 230Ps Quattro</title>
    <meta property="og:title" content="Audi Q3 F3 2019 S-Line 45 TFSI 230Ps Quattro" />
    <meta property="og:locality" content="71397 Leutenbach" />
    <script id="__NEXT_DATA__" type="application/json">
      {
        "props": {
          "pageProps": {
            "related": [
              {
                "adId": 3364655734,
                "title": "Audi A3 35 TDI Limousine S tronic S line 8-fach",
                "price": {
                  "amount": 25.9
                },
                "url": "/s-anzeige/audi-a3-35-tdi-limousine-s-tronic-s-line-8-fach/3364655734-216-8266"
              }
            ],
            "ad": {
              "adId": 3347173880,
              "title": "Audi Q3 F3 2019 S-Line 45 TFSI 230Ps Quattro",
              "description": "Mein neues Fahrzeug kommt bald.",
              "price": {
                "amount": 28000
              },
              "seller": {
                "id": 3934622,
                "name": "AP"
              },
              "url": "/s-anzeige/audi-q3-f3-2019-s-line-45-tfsi-230ps-quattro/3347173880-216-8473"
            }
          }
        }
      }
    </script>
    <script>
      window.BelenConf = {
        universalAnalyticsOpts: {
          dimensions: {
            ad_seller_type: "Private"
          }
        }
      };
      const config = {
        adCreationDate: "09.03.2026"
      };
      const payload = {
        "%DFP_TARGETS%": {
          "Marke": "audi",
          "Modell": "q3",
          "Kilometerstand": "89500",
          "Leistung": "230",
          "Kraftstoffart": "benzin",
          "Erstzulassungsjahr": "2019",
          "Erstzulassungsmonat": "3",
          "HU_Jahr": "2027",
          "HU_Monat": "2"
        }
      };
    </script>
  </head>
  <body>
    <main>
      <div id="viewad-description-text">Besichtigung und Probefahrt nach Absprache möglich.</div>
      <aside id="viewad-profile-box">
        <h2>AP</h2>
        <p>Mitglied seit 2019</p>
        <p>Privatanbieter</p>
      </aside>
      <article id="viewad-product">
        <img src="https://images.example.com/q3.jpg" alt="Audi Q3" />
      </article>
    </main>
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

  it("parses Kleinanzeigen DOM-heavy listing HTML into normalized data", () => {
    const result = parseKleinanzeigenHtml(
      kleinanzeigenDomFixture,
      "https://www.kleinanzeigen.de/s-anzeige/audi-q3-f3-2019-s-line-45-tfsi-230ps-quattro/3347173880-216-8473"
    );

    expect(result.listing.title).toContain("Audi Q3");
    expect(result.listing.priceAmount).toBe(28000);
    expect(result.listing.locationText).toBe("71397 Leutenbach");
    expect(result.listing.attributes.Kilometerstand).toBe("89.500 km");
    expect(result.listing.attributes.Ausstattung).toContain("Apple CarPlay");
    expect(result.listing.description).toContain("Probefahrt");
    expect(result.seller.externalSellerId).toBe("3934622");
    expect(result.seller.isCommercial).toBe(false);
    expect(result.seller.memberSinceText).toContain("2019");
    expect(result.images).toHaveLength(2);
    expect(result.listing.publishedAt).toContain("2026-03-09");
    expect(result.parserSignals.extractionStrategy).toBe("dom+meta");
  });

  it("matches the exact Kleinanzeigen ad in payloads with misleading related items", () => {
    const result = parseKleinanzeigenHtml(
      kleinanzeigenPayloadMatchFixture,
      "https://www.kleinanzeigen.de/s-anzeige/audi-q3-f3-2019-s-line-45-tfsi-230ps-quattro/3347173880-216-8473"
    );

    expect(result.listing.title).toContain("Audi Q3");
    expect(result.listing.priceAmount).toBe(28000);
    expect(result.listing.externalId).toBe("3347173880");
    expect(result.listing.locationText).toBe("71397 Leutenbach");
    expect(result.listing.attributes.Marke).toBe("audi");
    expect(result.listing.attributes.Modell).toBe("q3");
    expect(result.listing.attributes.Erstzulassung).toBe("03/2019");
    expect(result.listing.attributes.HU).toBe("2/2027");
    expect(result.seller.externalSellerId).toBe("3934622");
    expect(result.parserSignals.extractionStrategy).toBe("next_data+dom+meta");
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
      generationMode: "model",
      modelSlug: "google/gemini-3-flash-preview",
      negotiationAdvice: ["Start below ask and use any missing paperwork as leverage."],
      priceAssessment: "Recent comparable listings suggest the ask is within a normal range.",
      priceVerdict: "fair",
      questionsToAsk: ["Any defects or repairs?"],
      redFlags: ["No invoice mentioned."],
      recommendedAction: "negotiate",
      riskScore: 41,
      sellerAssessment: "Seller profile looks decent but not deeply verified.",
      sellerMessageDraft: "Hi, can you share the invoice and a few fresh photos?",
      summary: "The listing is roughly aligned with recent comparables.",
      thingsToCheck: ["Request close-up photos of the wear areas."]
    });

    expect(parsed.generationMode).toBe("model");
    expect(parsed.priceVerdict).toBe("fair");
    expect(parsed.estimatedFairRange.max).toBe(350);
  });
});
