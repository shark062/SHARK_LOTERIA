import { Link, useLocation } from "wouter";
import { LayoutDashboard, Ticket, ChartBar, History, LogOut, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

export function Navigation() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/generate", label: "Generator", icon: Ticket },
    { href: "/results", label: "Analysis", icon: ChartBar },
    { href: "/history", label: "My History", icon: History },
  ];

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-card/80 backdrop-blur-xl border-r border-white/5 hidden md:flex flex-col z-50">
      <div className="p-8">
        <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary font-display italic tracking-tighter">
          SHARK<span className="text-white block text-sm font-normal tracking-widest not-italic mt-1">LOTERIA 3050</span>
        </h1>
      </div>

      <nav className="flex-1 px-4 space-y-2">
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href} className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 font-ui font-medium tracking-wide",
              isActive 
                ? "bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_rgba(0,255,255,0.1)]" 
                : "text-muted-foreground hover:text-white hover:bg-white/5"
            )}>
              <item.icon className={cn("w-5 h-5", isActive && "animate-pulse")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 mt-auto border-t border-white/5">
        <div className="flex items-center gap-3 px-4 py-3 mb-2 rounded-xl bg-black/20">
          <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center text-secondary border border-secondary/30">
            <User className="w-4 h-4" />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium text-white truncate">{user?.firstName || 'User'}</p>
            <p className="text-xs text-muted-foreground truncate font-mono">ID: {user?.id?.slice(0,6)}...</p>
          </div>
        </div>
        
        <button 
          onClick={() => logout()}
          className="flex w-full items-center gap-3 px-4 py-3 rounded-xl text-destructive hover:bg-destructive/10 transition-colors font-ui font-medium"
        >
          <LogOut className="w-5 h-5" />
          Logout system
        </button>
      </div>
      
      <div className="p-4 text-center">
        <p className="text-[10px] text-muted-foreground/50 font-mono tracking-wider uppercase">
          Powered by Shark062
        </p>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const [location] = useLocation();
  
  const navItems = [
    { href: "/", icon: LayoutDashboard },
    { href: "/generate", icon: Ticket },
    { href: "/results", icon: ChartBar },
    { href: "/history", icon: History },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card/90 backdrop-blur-xl border-t border-white/10 md:hidden z-50 pb-safe">
      <div className="flex justify-around items-center p-4">
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href} className={cn(
              "flex flex-col items-center gap-1 p-2 rounded-lg transition-colors",
              isActive ? "text-primary" : "text-muted-foreground"
            )}>
              <item.icon className={cn("w-6 h-6", isActive && "drop-shadow-[0_0_8px_rgba(0,255,255,0.5)]")} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
