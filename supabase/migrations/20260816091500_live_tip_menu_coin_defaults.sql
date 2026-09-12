-- Keep the existing live tip records and wallet ledger intact while aligning
-- the visitor menu with the approved ascending coin order.
update public.tip_options set display_order = case id
  when 'great-show' then 1
  when 'need-more' then 2
  when 'appreciate-content' then 3
  when 'worth-every-minute' then 4
  when 'doing-amazing' then 5
  when 'cant-stop-watching' then 6
  when 'favorite-creators' then 7
  when 'yall-nasty' then 8
  when 'big-tipper' then 9
  else display_order
end,
updated_at = now()
where id in ('great-show','need-more','appreciate-content','worth-every-minute','doing-amazing','cant-stop-watching','favorite-creators','yall-nasty','big-tipper');

update public.tip_menu_settings
set minimum_custom_tokens = 1,
    updated_at = now()
where id = 1 and minimum_custom_tokens > 1;
