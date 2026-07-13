-- P2-09 schema follow-up (MariaDB-compatible — plain ENUM MODIFY, no MySQL-8-only feature).
-- 1) LedgerReason += shop_buy, shop_sell (starter NPC shop faucet/sink — P2-11 uses these reasons).
-- Note: the brief asked to drop item_instances' crack-timestamp column, but that column was never
--       created (0001_init postdates the crack decision being superseded — no crack column exists).
--       So this migration only extends the ledger reason enum. No table/column DROP is needed.

-- AlterEnum (add shop_buy / shop_sell to currency_ledger.reason)
ALTER TABLE `currency_ledger`
  MODIFY `reason` ENUM('drop', 'quest_reward', 'market_sale', 'market_purchase', 'market_tax', 'enhancement_cost', 'trade', 'admin_adjustment', 'purchase_topup', 'compensation', 'shop_buy', 'shop_sell') NOT NULL;
