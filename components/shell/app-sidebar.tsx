"use client";

import { ChartNoAxesColumn, ChevronsUpDown, Copy, FileText, LogOut, PenLine, Plus, Settings } from "lucide-react";
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

export function AppSidebar({ user, focus, bankEnabled=false, quickEnabled=false }: { user: { name: string; email: string }; focus?: string; bankEnabled?: boolean; quickEnabled?: boolean }) {
  const pathname = usePathname();
  return (
    <Sidebar collapsible="icon" className="border-transparent">
      <SidebarHeader className="h-14 flex-row items-center justify-between px-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
        <span className="group-data-[collapsible=icon]:hidden"><Wordmark /></span>
        <SidebarTrigger className="text-muted-foreground" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem className="mb-2">
              {bankEnabled ? <SidebarMenuButton tooltip="新建作文" className="h-9 justify-center border border-input bg-sheet font-medium shadow-none hover:border-faint hover:bg-sheet group-data-[collapsible=icon]:justify-start" render={<Link href="/#topics" />}><Plus />新建作文</SidebarMenuButton> : <NewEssayDialog focus={focus} trigger={
                <SidebarMenuButton tooltip="新建作文" className="h-9 justify-center border border-input bg-sheet font-medium shadow-none hover:border-faint hover:bg-sheet group-data-[collapsible=icon]:justify-start">
                  <Plus />新建作文
                </SidebarMenuButton>
              } />}
            </SidebarMenuItem>
            {(bankEnabled ? [{href:"/",label:"练习",icon:PenLine},{href:"/essays",label:"作文",icon:FileText},...(quickEnabled ? [{href:"/cards",label:"卡片",icon:Copy}] : []),NAV[1]] : NAV).map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton isActive={active} tooltip={item.label} className="h-9 gap-2.5 px-2.5 text-[14px] text-muted-foreground data-active:bg-sheet data-active:text-foreground data-active:shadow-[var(--shadow-panel),0_0_0_1px_var(--border)] [&_svg]:size-[17px]" render={<Link href={item.href} />}>
                    <item.icon />{item.label}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
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
