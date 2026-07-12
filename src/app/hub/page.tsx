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
    // key="anon": ไม่มี session ต้อง remount เสมอเทียบกับ accountId ใด ๆ ก่อนหน้า (เผื่อ logout)
    return <HubShell key="anon" authenticated={false} isGuest={false} initialCharacters={[]} />;
  }

  const characters = await listCharacters(getCharacterRepository(), session.accountId);
  // key={accountId}: router.refresh() re-run Server Component นี้ แต่ React **preserve** client
  // component instance เดิม (type+ตำแหน่งใน tree ไม่เปลี่ยน) → useState initializer ไม่รันซ้ำ =
  // logout แล้ว login ด้วย account อื่น (หรือกลับมา account เดิมหลังเคย logout) จะเห็น state
  // (characters/view/confirmingLogout) ค้างจาก session ก่อนหน้าทั้งที่ props ใหม่มาแล้ว. ผูก key
  // กับ accountId บังคับ remount (React reset state ทั้งหมด) เมื่อ "ใครคือผู้ใช้" เปลี่ยนจริง —
  // mutate ภายใน session เดียวกัน (สร้างตัวละคร, upgrade guest→email) accountId ไม่เปลี่ยน คง state ปกติ.
  return (
    <HubShell key={session.accountId} authenticated isGuest={session.isGuest} initialCharacters={characters} />
  );
}
