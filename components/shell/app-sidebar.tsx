"use client";

import { ChartNoAxesColumn, ChevronsUpDown, FileText, Layers, LogOut, PenLine, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, SidebarTrigger } from "@/components/ui/sidebar";
import { THEME_ICON, THEME_LABEL, useTheme, type Theme } from "@/components/theme/theme-toggle";
import { NewEssayDialog } from "./new-essay";
import { Wordmark } from "./wordmark";

const NAV = [
  { href: "/", label: "作文", icon: FileText },
  { href: "/progress", label: "进展", icon: ChartNoAxesColumn },
];

export function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  return <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-full bg-foreground font-medium text-background" style={{ width: size, height: size, fontSize: size * 0.46 }}>{Array.from(name)[0]}</span>;
}

export function AppSidebar({ user, focus, bankEnabled=false, reviewDue=0 }: { user: { name: string; email: string }; focus?: string; bankEnabled?: boolean; reviewDue?: number }) {
  const pathname = usePathname();
  // 题库开启后“练习”就是开始写的地方，不再另放一个去同一处的“新建作文”
  const items = bankEnabled
    ? [{ href: "/", label: "练习", icon: PenLine }, { href: "/essays", label: "作文", icon: FileText }, { href: "/cards", label: "复习", icon: Layers, count: reviewDue }, NAV[1]]
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
              const active = item.href === "/" ? pathname === "/" || pathname.startsWith("/topics") : pathname.startsWith(item.href);
              const count = "count" in item ? item.count ?? 0 : 0;
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton isActive={active} tooltip={item.label} className="h-10 gap-3 rounded-lg px-3 text-[15px] text-muted-foreground data-active:bg-sidebar-accent data-active:font-medium data-active:text-foreground [&_svg]:size-[18px]" render={<Link href={item.href} />}>
                    <item.icon />{item.label}
                    {count > 0 && <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground tabular-nums group-data-[collapsible=icon]:hidden" aria-label={`${count} 条待复习`}>{count}</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="px-3 pb-3">
        <AccountMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function AccountMenu({ user }: { user: { name: string; email: string } }) {
  const { theme, setTheme } = useTheme();
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Clear cached private page state at the authentication boundary.
      window.location.assign("/login");
    } catch { setBusy(false); }
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
                <span className="truncate text-xs font-normal">{user.email}</span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/account" />}><Settings />账户设置</DropdownMenuItem>
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
