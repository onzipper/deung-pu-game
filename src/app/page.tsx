import Link from "next/link";

// Title / landing splash (P2 UI §6 Login/Guest Entry) — แทน Next default template ที่ owner ทัก. โลโก้ชื่อเกม +
// backdrop + CTA "เข้าเล่น" → /hub (ที่มี guest/email entry + character select จริง = §6 AuthPanel 420px). server
// component (ไม่มี hook/backend ใหม่) · token-driven (--dp-*, E1). backdrop = token-gradient placeholder จนกว่าจะมี
// art เมืองจริง (F2 city landmarks §6.2 "เมืองอุ่น + teal seal light").

export const metadata = {
  title: "ดึ๋งปุ๊ — 2.5D Isometric MMORPG",
};

export default function Home() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-(--dp-deep-ink) px-6 text-center">
      {/* backdrop placeholder (warm + teal seal light + overlay อ่านข้อความ ~45%, §6.2) — token gradient จนกว่ามี art F2 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 45% at 50% 28%, color-mix(in srgb, var(--dp-resonance-teal) 22%, transparent) 0%, transparent 72%)," +
            "radial-gradient(120% 100% at 50% 10%, var(--dp-warm-ink) 0%, var(--dp-deep-ink) 62%)",
        }}
      />

      <div className="relative flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-6xl font-black tracking-tight text-(--dp-parchment) drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)] sm:text-7xl">
            ดึ๋งปุ๊
          </h1>
          <p className="max-w-md text-base text-(--dp-sand) sm:text-lg">
            โลก 2.5D isometric MMORPG — ผจญภัย ตีบวก ล่าบอส ไปกับเพื่อนดึ๋งๆ
          </p>
        </div>

        <Link
          href="/hub"
          className="flex min-h-[52px] items-center rounded-(--dp-radius-md) bg-(--dp-resonance-teal) px-10 text-lg font-bold text-(--dp-deep-ink) shadow-lg transition-colors hover:bg-(--dp-resonance-light)"
        >
          เข้าเล่น
        </Link>
        <p className="text-xs text-(--dp-clay)">เล่นแบบ Guest ได้ทันที · เชื่อม Email ภายหลังได้</p>
      </div>

      {/* server/version caption (§6.2) */}
      <p className="absolute bottom-4 text-xs text-(--dp-clay)">ดึ๋งปุ๊ · Open Beta</p>
    </main>
  );
}
