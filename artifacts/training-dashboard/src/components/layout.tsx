import { useGetAthlete, getGetAthleteQueryKey } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Activity, LayoutDashboard, List, BarChart3, Settings, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: athlete } = useGetAthlete({
    query: {
      queryKey: getGetAthleteQueryKey()
    }
  });

  const links = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/activities", label: "Activities", icon: List },
    { href: "/stats", label: "Stats", icon: BarChart3 },
  ];

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-card border-r border-border p-4 w-64">
      <div className="flex items-center gap-2 px-2 py-4 mb-6">
        <div className="bg-primary text-primary-foreground p-1.5 rounded-md">
          <Activity className="w-5 h-5" />
        </div>
        <span className="font-bold text-xl tracking-tight">KINETIC</span>
      </div>

      <nav className="flex-1 space-y-1">
        {links.map((link) => {
          const isActive = location === link.href || (link.href !== '/' && location.startsWith(link.href));
          return (
            <Link key={link.href} href={link.href} className="block">
              <div className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                isActive 
                  ? "bg-primary/10 text-primary font-medium" 
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}>
                <link.icon className="w-4 h-4" />
                {link.label}
              </div>
            </Link>
          );
        })}
      </nav>

      {athlete && (
        <div className="mt-auto pt-4 border-t border-border flex items-center gap-3 px-2">
          <Avatar className="w-10 h-10 border border-border">
            <AvatarImage src={athlete.profile} />
            <AvatarFallback>{athlete.firstname?.charAt(0)}{athlete.lastname?.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{athlete.firstname} {athlete.lastname}</span>
            <span className="text-xs text-muted-foreground">{athlete.city || 'Athlete'}</span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex w-full dark">
      {/* Desktop Sidebar */}
      <div className="hidden md:block fixed inset-y-0 left-0 z-50">
        <SidebarContent />
      </div>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-card border-b border-border flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-2">
          <div className="bg-primary text-primary-foreground p-1 rounded-sm">
            <Activity className="w-4 h-4" />
          </div>
          <span className="font-bold tracking-tight">KINETIC</span>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="w-8 h-8">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 border-r-0">
            <SidebarContent />
          </SheetContent>
        </Sheet>
      </div>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 mt-14 md:mt-0 p-4 md:p-8 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}