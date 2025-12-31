import { useState } from "react";
import { NeonCard } from "@/components/NeonCard";
import { NumberBall } from "@/components/NumberBall";
import { useAnalysis, useLatestResult } from "@/hooks/use-lottery";
import { Brain, Flame, Snowflake, AlertOctagon } from "lucide-react";
import { cn } from "@/lib/utils";

const GRID_SIZE_MAP: Record<string, number> = {
  "mega-sena": 60,
  "lotofacil": 25,
  "quina": 80,
  "lotomania": 100,
};

export default function Results() {
  const [gameType, setGameType] = useState("mega-sena");
  const { data: analysis } = useAnalysis(gameType);
  const { data: latest } = useLatestResult(gameType);

  const gridSize = GRID_SIZE_MAP[gameType] || 60;
  
  // Calculate heat color
  const getHeatColor = (frequency: number) => {
    // Normalize frequency roughly (0-20 scale assumption for demo)
    if (frequency > 15) return "bg-red-500 shadow-[0_0_10px_red]";
    if (frequency > 10) return "bg-orange-500";
    if (frequency > 5) return "bg-yellow-500";
    if (frequency > 2) return "bg-blue-400";
    return "bg-blue-900/50 text-white/30";
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <h1 className="text-4xl font-display font-black text-white uppercase">Analysis Core</h1>
        <div className="flex gap-2">
          {["mega-sena", "lotofacil", "quina"].map(type => (
            <button
              key={type}
              onClick={() => setGameType(type)}
              className={cn(
                "px-4 py-2 rounded-lg font-ui font-bold uppercase transition-all",
                gameType === type 
                  ? "bg-primary text-black shadow-[0_0_15px_rgba(0,255,255,0.4)]" 
                  : "bg-white/5 text-muted-foreground hover:bg-white/10"
              )}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Heatmap Section */}
        <div className="lg:col-span-2">
          <NeonCard glowColor="none" className="h-full">
            <h3 className="text-xl font-display font-bold text-white mb-6 flex items-center gap-2">
              <Flame className="w-5 h-5 text-red-500" />
              FREQUENCY HEATMAP
            </h3>
            
            <div className="grid grid-cols-10 gap-2 md:gap-3">
              {Array.from({ length: gridSize }).map((_, i) => {
                const num = i + 1;
                const frequency = analysis?.stats.frequencyMap[num] || 0;
                return (
                  <div 
                    key={num}
                    className={cn(
                      "aspect-square rounded flex items-center justify-center text-xs md:text-sm font-bold transition-all duration-300 hover:scale-110 cursor-help",
                      getHeatColor(frequency)
                    )}
                    title={`Number ${num}: Drawn ${frequency} times`}
                  >
                    {num}
                  </div>
                );
              })}
            </div>
            
            <div className="flex justify-between mt-6 text-xs text-muted-foreground font-mono">
              <div className="flex items-center gap-2"><div className="w-3 h-3 bg-blue-900/50 rounded" /> RARE</div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 bg-blue-400 rounded" /> COLD</div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 bg-yellow-500 rounded" /> WARM</div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 bg-red-500 rounded" /> HOT</div>
            </div>
          </NeonCard>
        </div>

        {/* Stats & AI Panel */}
        <div className="space-y-6">
          <NeonCard glowColor="secondary">
            <div className="flex items-center gap-3 mb-4 text-secondary">
              <Brain className="w-6 h-6" />
              <h3 className="font-display font-bold text-lg">AI INSIGHT</h3>
            </div>
            <p className="text-sm leading-relaxed text-white/80 font-ui border-l-2 border-secondary/30 pl-4">
              {analysis?.recommendation || "Analyzing pattern streams..."}
            </p>
          </NeonCard>

          <NeonCard glowColor="none">
            <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4">Extremes</h4>
            
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2 text-red-400 text-xs font-bold uppercase">
                  <Flame className="w-4 h-4" /> Hottest Numbers
                </div>
                <div className="flex flex-wrap gap-2">
                  {analysis?.stats.hotNumbers.slice(0, 5).map(num => (
                    <NumberBall key={num} number={num} size="sm" variant="hot" />
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2 text-blue-400 text-xs font-bold uppercase">
                  <Snowflake className="w-4 h-4" /> Coldest Numbers
                </div>
                <div className="flex flex-wrap gap-2">
                  {analysis?.stats.coldNumbers.slice(0, 5).map(num => (
                    <NumberBall key={num} number={num} size="sm" variant="cold" />
                  ))}
                </div>
              </div>
              
              <div>
                <div className="flex items-center gap-2 mb-2 text-purple-400 text-xs font-bold uppercase">
                  <AlertOctagon className="w-4 h-4" /> Rare (Last 20)
                </div>
                <div className="flex flex-wrap gap-2">
                  {analysis?.stats.rareNumbers.slice(0, 5).map(num => (
                    <NumberBall key={num} number={num} size="sm" className="bg-purple-900/40 border-purple-500 text-purple-200" />
                  ))}
                </div>
              </div>
            </div>
          </NeonCard>
        </div>
      </div>
    </div>
  );
}
