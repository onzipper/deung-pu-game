# chr_swordsman — prepared-ahead poses (not wired into `entity.json`)

`skill` (3), `hit` (2), `dead` (3), `jump` (2), `crit` (3) — drawn for direction **S only**, per the
art brief ("runtime ยังไม่ใช้ เตรียมล่วงหน้า"). Naming matches the entity convention
(`chr_swordsman_<anim>_s_<frame>.svg`) but they are **not** declared in `../entity.json`.

## Why not just declare them in entity.json?

`scripts/svg/manifest.ts` has no per-animation `directions` override — `EntitySpec.animations` only
carries `fps/loop/frameCount/contactFrame`; every animation inherits the entity-wide
`drawnDirections` (5 dirs) uniformly (`manifest.ts:106`, `directions = spec.drawnDirections.map(...)`).
`scripts/svg/raster-resvg.ts` does tolerate missing frames (a documented "content track" fallback —
reuses another existing frame for the entity, with a build warning) rather than hard-failing, so
declaring these 5 animations with only S drawn *would* build. But that fallback is meant for art that
is genuinely mid-production and will be filled in soon; these poses are deliberately S-only and not
runtime-consumed yet, so declaring 5 directions for them would make the manifest/atlas claim
non-existent SW/W/NW/N art (silently backfilled with an unrelated frame) for poses nothing reads.
Keeping them un-registered here avoids that misleading claim — svg:build still mirrors them to
`public/assets/icons/` as standalone SVGs (harmless) since they sit outside `entity.json`'s directory
convention for entity frames.

When SW/W/NW/N art for these poses is ready (or a future manifest format adds a per-animation
`directions` override), move the files up into `../` and add the animation block to `entity.json`.
