import type { Metadata } from "next";
import { readSession } from "@/server/auth/http";
import { getCharacterRepository } from "@/server/characters/http";
import { listCharacters } from "@/server/characters/service";
import { HubShell } from "./HubShell";

export const metadata: Metadata = {
  title: "ดึ๋งปุ๊ — Game Hub",
};

export const dynamic = "force-dynamic";

// Server Component: อ่าน session (httpOnly cookie) + list ตัวละครตรงนี้ ไม่ fetch รอบสองฝั่ง client
// (Storage §5–§9). HubShell = client component รับ initial data แล้วเรียก API ต่อเองตอน mutate (create ฯลฯ)
// แล้ว router.refresh() เพื่อให้ Server Component ชุดนี้ re-run ด้วย session/state ล่าสุด.
export default async function HubPage() {
  const session = await readSession();

  if (!session) {
    return <HubShell authenticated={false} isGuest={false} initialCharacters={[]} />;
  }

  const characters = await listCharacters(getCharacterRepository(), session.accountId);
  return <HubShell authenticated isGuest={session.isGuest} initialCharacters={characters} />;
}
