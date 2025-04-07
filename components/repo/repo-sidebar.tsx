"use client";

import Link from "next/link";
import { useUser } from "@/contexts/user-context";
import { useRepo } from "@/contexts/repo-context";
import { User } from "@/components/user";
import { RepoDropdown } from "@/components/repo/repo-dropdown";
import { RepoNav } from "@/components/repo/repo-nav";
import { About } from "@/components/about";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const RepoSidebar = ({
  onClick
}: {
  onClick?: () => void
}) => {
  const { user } = useUser();
  const repo = useRepo();

  const account = user?.accounts?.find((account) => account.login === repo.owner);

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <header className="border-b flex items-center py-2">
            <Link className={buttonVariants({ variant: "ghost", size: "xs" })} href="/" prefetch={true}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              All projects
            </Link>
          </header>
        </SidebarGroup>

        <SidebarGroup>
          <RepoDropdown onClick={onClick} />
        </SidebarGroup>

        <SidebarGroup className="flex-1 overflow-auto">
          <SidebarMenu>
            <nav className="flex flex-col gap-y-1">
              <RepoNav onClick={onClick} />
            </nav>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarFooter>
          <footer className="flex items-center gap-x-2 py-2">
            <User className="mr-auto" onClick={onClick} />
            <About onClick={onClick} />
          </footer>
        </SidebarFooter>
      </SidebarContent>
    </Sidebar>
  );
}

export { RepoSidebar };