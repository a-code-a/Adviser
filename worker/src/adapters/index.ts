import { type MarketplaceAdapter, type MarketplaceName } from "@/lib/core/marketplaces";

import { EbayAdapter } from "./ebay";
import { KleinanzeigenAdapter } from "./kleinanzeigen";

const adapters: Record<MarketplaceName, MarketplaceAdapter> = {
  ebay: new EbayAdapter(),
  kleinanzeigen: new KleinanzeigenAdapter()
};

export function getMarketplaceAdapter(marketplace: MarketplaceName) {
  return adapters[marketplace];
}
