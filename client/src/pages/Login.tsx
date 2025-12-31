import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

export default function Login() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  if (isLoading) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-black relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/20 blur-[120px] rounded-full pointer-events-none" />
      
      <div className="relative z-10 max-w-md w-full p-8 text-center space-y-8 bg-card/50 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl">
        <div className="space-y-2">
          <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary font-display italic tracking-tighter animate-pulse">
            SHARK<br/><span className="text-white text-2xl font-normal tracking-[0.5em] not-italic">LOTERIA</span>
          </h1>
          <p className="text-muted-foreground font-ui text-lg mt-4">
            Advanced Lottery Probability Engine
          </p>
        </div>

        <div className="p-1 rounded-2xl bg-gradient-to-r from-primary via-secondary to-accent">
          <button 
            onClick={() => window.location.href = "/api/login"}
            className="w-full bg-black hover:bg-black/80 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-3 uppercase tracking-widest font-ui group"
          >
            Initialize System
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse group-hover:scale-150 transition-transform" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground/50 font-mono">
          SECURE CONNECTION REQUIRED • SYSTEM 3050.v1
        </p>
      </div>
    </div>
  );
}
