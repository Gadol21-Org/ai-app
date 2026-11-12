import type * as React from "react";
import { MessagesSquare, Settings } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { ThreadList } from "@/components/assistant-ui/elements/thread-list.aui";
import { t } from "@/lib/i18n";

export function ThreadListSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar side="right" {...props}>
      <SidebarHeader className="aui-sidebar-header mb-2 border-b">
        <div className="aui-sidebar-header-content flex items-center justify-between">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                render={
                  <a
                    href="/"
                  />
                }
              >
                <div className="aui-sidebar-header-icon-wrapper bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <MessagesSquare className="aui-sidebar-header-icon size-4" />
                </div>
                <div className="aui-sidebar-header-heading me-6 flex flex-col gap-0.5 leading-none">
                  <span className="aui-sidebar-header-title font-semibold">
                    {t.appName}
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarHeader>
      <SidebarContent className="aui-sidebar-content px-2">
        <ThreadList />
      </SidebarContent>
      {props.collapsible !== "none" && <SidebarRail />}
      <SidebarFooter className="aui-sidebar-footer border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link href="/settings" />}>
              <Settings />
              <span>{t.sidebar.settings}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <ThemeToggle />
      </SidebarFooter>
    </Sidebar>
  );
}
