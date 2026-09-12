-- Align the database catalog with the shared six-slot Sandbox coin catalog.
-- Promotional bonus coins remain zero until an approved promotion is configured.
alter table public.coin_packages drop constraint if exists coin_packages_amount_check;
alter table public.coin_packages
  add constraint coin_packages_amount_check check (amount >= 5 and amount <= 1000);

insert into public.coin_packages (label, amount, currency, base_coins, bonus_percent, badge_text, display_order, highlighted, enabled)
values
  ('$5 Starter', 5, 'USD', 10, 0, null, 1, false, true),
  ('$10 Quick Refill', 10, 'USD', 20, 0, null, 2, false, true),
  ('$16 Hourly Credit', 16, 'USD', 32, 0, null, 3, false, true),
  ('$25 Wallet Refill', 25, 'USD', 50, 0, null, 4, false, true),
  ('$50 Bundle', 50, 'USD', 100, 0, 'Popular', 5, false, true),
  ('$100 Best Value', 100, 'USD', 200, 0, 'Best Value', 6, true, true);
