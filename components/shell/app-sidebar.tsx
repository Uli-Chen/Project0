"use client";

import { ChartNoAxesColumn, ChevronsUpDown, FileText, House, Layers, LogOut, PenLine, Plus, Settings, Timer } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { THEME_ICON, THEME_LABEL, useTheme, type Theme } from "@/components/theme/theme-toggle";
import { NewEssayDialog } from "./new-essay";
import { Wordmark } from "./wordmark";

const LOGOUT_TOAST = "logout-failed";

const NAV = [
  { href: "/", label: "作文", icon: FileText },
  { href: "/progress", label: "进展", icon: ChartNoAxesColumn },
];

export function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  return <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-full bg-foreground font-medium text-background" style={{ width: size, height: size, fontSize: size * 0.46 }}>{Array.from(name)[0]}</span>;
}

export function AppSidebar({ user, focus, bankEnabled=false, checkpointsEnabled=false }: { user: { name: string; email: string }; focus?: string; bankEnabled?: boolean; checkpointsEnabled?: boolean }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  // On a phone the navigation is a sheet over the page; get it out of the way as soon as you pick a page.
  const closeMobile = () => setOpenMobile(false);
  // 题库开启后“练习”页就是开始写的地方，不再另放一个去同一处的“新建作文”
  const items = bankEnabled
    ? [{ href: "/", label: "主页", icon: House }, { href: "/practice", label: "练习", icon: PenLine }, { href: "/cards", label: "复习", icon: Layers }, ...(checkpointsEnabled ? [{ href: "/mock", label: "模考", icon: Timer }] : []), NAV[1]]
    : NAV;
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 flex-row items-center justify-between px-4 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
        <span className="group-data-[collapsible=icon]:hidden"><Wordmark /></span>
        <SidebarTrigger className="text-muted-foreground" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="px-3">
          <SidebarMenu className="gap-1">
            {!bankEnabled && (
              <SidebarMenuItem className="mb-3">
                <NewEssayDialog focus={focus} trigger={
                  <SidebarMenuButton tooltip="新建作文" className="h-10 justify-center rounded-full bg-foreground font-medium text-background hover:bg-foreground/85 hover:text-background group-data-[collapsible=icon]:justify-start">
                    <Plus />新建作文
                  </SidebarMenuButton>
                } />
              </SidebarMenuItem>
            )}
            {items.map((item) => {
              const active = item.href === "/" ? pathname === "/" : item.href === "/practice" ? pathname.startsWith("/practice") || pathname.startsWith("/topics") : pathname.startsWith(item.href);
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton isActive={active} tooltip={item.label} className="h-10 gap-3 rounded-lg px-3 text-[15px] text-muted-foreground data-active:bg-sidebar-accent data-active:font-medium data-active:text-foreground [&_svg]:size-[18px]" render={<Link href={item.href} onNavigate={closeMobile} />}>
                    <item.icon />{item.label}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="px-3 pb-3">
        <AccountMenu user={user} onNavigate={closeMobile} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function AccountMenu({ user, onNavigate }: { user: { name: string; email: string }; onNavigate: () => void }) {
  const { theme, setTheme } = useTheme();
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    toast.dismiss(LOGOUT_TOAST);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Clear cached private page state at the authentication boundary.
      window.location.assign("/login");
    } catch {
      setBusy(false);
      // The menu has already closed, so say plainly that nothing changed, and stay until handled.
      toast.error("退出失败，你仍处于登录状态", { id: LOGOUT_TOAST, duration: Infinity, action: { label: "重试", onClick: () => void logout() } });
    }
  }
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" tooltip={user.name} className="data-popup-open:bg-sidebar-accent" />}>
            <Avatar name={user.name} />
            <span className="min-w-0 flex-1 truncate text-left text-sm">{user.name}</span>
            <ChevronsUpDown className="ml-auto text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-60">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
                <span className="text-sm font-medium text-foreground">{user.name}</span>
                <span className="truncate text-[14px] font-normal">{user.email}</span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/account" onNavigate={onNavigate} />}><Settings />账户设置</DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{(() => { const Icon = THEME_ICON[theme]; return <Icon />; })()}外观</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
                  {(Object.keys(THEME_LABEL) as Theme[]).map((value) => <DropdownMenuRadioItem key={value} value={value}>{THEME_LABEL[value]}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={busy} onClick={logout}><LogOut />{busy ? "正在退出…" : "退出登录"}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
