import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Navigation from "@/components/Navigation";
import CelebrationAnimation from "@/components/CelebrationAnimation";
import LiveEmbed from "@/components/LiveEmbed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLotteryTypes, useUserStats } from "@/hooks/useLotteryData";
import { jsPDF } from "jspdf";
import logoPng from "@assets/Logo_Futurista_da_Shark_Loterias_1757013773517-B635QT2F_1767439134606.png";
import { 
  Trophy, 
  TrendingUp, 
  Calendar, 
  DollarSign,
  Target,
  Filter,
  Search,
  Medal,
  Award,
  Sparkles,
  BarChart3,
  Zap,
  Clock,
  Download,
  FileText
} from "lucide-react";
import type { UserGame, NextDrawInfo } from "@/types/lottery";

export default function Results() {
  const [filterLottery, setFilterLottery] = useState<string>('all');
  const [searchContest, setSearchContest] = useState<string>('');
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationPrize, setCelebrationPrize] = useState<string>();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedLottery, setSelectedLottery] = useState<string>('');
  const [filterDate, setFilterDate] = useState<string>('');
  const [filterMonth, setFilterMonth] = useState<string>('');
  const [filterYear, setFilterYear] = useState<string>('');
  const [filterTime, setFilterTime] = useState<string>('');

  // Data queries
  const { data: lotteryTypes } = useLotteryTypes();

  const { data: userStats, isLoading: statsLoading } = useQuery({
    queryKey: ['user-stats'],
    queryFn: async () => {
      const response = await fetch('/api/users/stats');
      if (!response.ok) throw new Error('Failed to fetch user stats');
      return response.json();
    },
    refetchInterval: 60000, // Refetch every 60 seconds
  });



  // Update time every second for real-time display
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const { data: userGames, isLoading: gamesLoading, refetch: refetchGames } = useQuery({
    queryKey: ["/api/games?limit=50"],
    staleTime: 2 * 60 * 1000,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Filter games
  const filteredGames = userGames && Array.isArray(userGames) ? userGames.filter((game: any) => {
    // Filter by lottery
    if (filterLottery !== 'all' && game.lotteryId !== filterLottery) return false;
    
    // Filter by contest number
    if (searchContest && !game.contestNumber?.toString().includes(searchContest)) return false;
    
    // Filter by specific date (YYYY-MM-DD)
    if (filterDate) {
      const gameDate = new Date(game.createdAt).toLocaleDateString('pt-BR');
      const filterDateBR = new Date(filterDate + 'T00:00:00').toLocaleDateString('pt-BR');
      if (gameDate !== filterDateBR) return false;
    }
    
    // Filter by month/year (MM/YYYY)
    if (filterMonth) {
      const gameMonth = new Date(game.createdAt).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });
      if (gameMonth !== filterMonth) return false;
    }
    
    // Filter by year (YYYY)
    if (filterYear) {
      const gameYear = new Date(game.createdAt).getFullYear().toString();
      if (gameYear !== filterYear) return false;
    }
    
    // Filter by time (HH:MM)
    if (filterTime) {
      const gameTime = new Date(game.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      if (gameTime !== filterTime) return false;
    }
    
    return true;
  }) : [];

  // Get lottery display name
  const getLotteryName = (lotteryId: string) => {
    return lotteryTypes?.find(l => l.id === lotteryId)?.displayName || lotteryId;
  };

  // Get prize tier description
  const getPrizeTier = (lotteryId: string, matches: number) => {
    const tiers: Record<string, Record<number, string>> = {
      megasena: {
        6: 'Sena',
        5: 'Quina', 
        4: 'Quadra',
      },
      lotofacil: {
        15: '15 acertos',
        14: '14 acertos',
        13: '13 acertos',
        12: '12 acertos',
        11: '11 acertos',
      },
      quina: {
        5: 'Quina',
        4: 'Quadra',
        3: 'Terno',
        2: 'Duque',
      },
    };

    return tiers[lotteryId]?.[matches] || `${matches} acertos`;
  };

  // Get matches color
  const getMatchesColor = (matches: number, prizeWon: string) => {
    const prize = parseFloat(prizeWon || "0");
    if (prize > 1000) return "text-neon-gold";
    if (prize > 100) return "text-neon-green";
    if (prize > 0) return "text-accent";
    return "text-muted-foreground";
  };

  // Calculate total prize won
  const totalPrizeWon = filteredGames.reduce((sum, game) => 
    sum + parseFloat(game.prizeWon || "0"), 0
  );

  // Get winning games
  const winningGames = filteredGames.filter(game => parseFloat(game.prizeWon || "0") > 0);

  // Get best result
  const bestResult = winningGames.reduce((best, game) => {
    const prize = parseFloat(game.prizeWon || "0");
    const bestPrize = parseFloat(best?.prizeWon || "0");
    return prize > bestPrize ? game : best;
  }, null as UserGame | null);

  const exportToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Adicionar marca d'água
    const imgWidth = 100;
    const imgHeight = 100;
    
    // Add watermark with low opacity if possible, otherwise just centralize
    try {
      // Usar um estado gráfico para garantir que a opacidade não afete o resto do documento
      doc.saveGraphicsState();
      
      // Ajustar opacidade para ser bem sutil como fundo (0.05 a 0.1)
      const gState = new (doc as any).GState({ opacity: 0.05 });
      doc.setGState(gState);
      
      doc.addImage(
        logoPng,
        "PNG",
        (pageWidth - imgWidth) / 2,
        (pageHeight - imgHeight) / 2,
        imgWidth,
        imgHeight,
        undefined,
        'FAST'
      );
      
      doc.restoreGraphicsState();
    } catch (e) {
      console.error("Error adding watermark:", e);
    }

    // Cabeçalho
    doc.setFontSize(22);
    doc.setTextColor(0, 150, 255); // Azul Shark
    doc.text("Shark Loterias - Relatorio de Jogos", pageWidth / 2, 20, { align: "center" });

    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, pageWidth / 2, 30, { align: "center" });

    // Estatísticas
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text("Resumo de Performance", 20, 45);
    
    doc.setFontSize(12);
    doc.text(`Total de Jogos: ${userStats?.totalGames || 0}`, 20, 55);
    doc.text(`Premios Ganhos: ${userStats?.wins || 0}`, 20, 62);
    doc.text(`Taxa de Acerto: ${userStats?.accuracy || 0}%`, 20, 69);
    doc.text(`Total Acumulado: R$ ${totalPrizeWon.toFixed(2).replace(".", ",")}`, 20, 76);

    // Lista de Jogos
    doc.setFontSize(16);
    doc.text("Historico Detalhado", 20, 90);

    let yPos = 100;
    filteredGames.forEach((game: any, index: number) => {
      if (yPos > pageHeight - 40) {
        doc.addPage();
        yPos = 20;
      }

      const prize = parseFloat(game.prizeWon || "0");
      doc.setFontSize(12);
      doc.text(`${index + 1}. ${getLotteryName(game.lotteryId)} - Concurso #${game.contestNumber}`, 20, yPos);
      
      doc.setFontSize(10);
      doc.text(`Data: ${new Date(game.createdAt).toLocaleDateString("pt-BR")}`, 20, yPos + 7);
      doc.text(`Numeros: ${game.selectedNumbers.join(", ")}`, 20, yPos + 14);
      doc.text(`Acertos: ${game.matches} | Premio: R$ ${prize.toFixed(2).replace(".", ",")}`, 20, yPos + 21);
      doc.text(`Estrategia: ${game.strategy === "ai" ? "Inteligencia Artificial" : game.strategy}`, 20, yPos + 28);

      yPos += 40;
    });

    doc.save("Shark_Loterias_Relatorio.pdf");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
          <div className="text-center md:text-left">
            <h2 className="text-3xl font-bold neon-text text-primary mb-2" data-testid="results-title">
              Resultados 📊
            </h2>
            <p className="text-muted-foreground">
              Histórico completo dos seus jogos e prêmios
            </p>
          </div>
          
          <Button 
            onClick={exportToPDF}
            className="bg-primary hover:bg-primary/80 text-white flex items-center gap-2"
            data-testid="button-export-pdf"
          >
            <Download className="h-4 w-4" />
            Exportar Relatório PDF
          </Button>
        </div>

        {/* Live Draw Video */}
        <Card className="bg-black/20 mb-8">
          <CardHeader>
            <CardTitle className="text-primary flex items-center">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <span>🎬 Sorteios ao Vivo</span>
              </div>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Acompanhe os sorteios das loterias em tempo real
            </p>
          </CardHeader>
          <CardContent>
            <div className="aspect-video w-full rounded-lg overflow-hidden bg-black/20">
              <LiveEmbed channelId="UCPbhr02AfVb2nd5pm12BxTw" />
            </div>
            <div className="mt-4 space-y-3">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">
                  Transmissão oficial da Caixa Econômica Federal
                </p>
              </div>

              {/* Live Draw Info */}
              <div className="bg-black/30 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-center space-x-2 mb-3">
                  <Clock className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-primary">Informações dos Sorteios</span>
                </div>

                {/* Current Time */}
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">Horário Atual (Brasília)</div>
                  <div className="font-mono text-lg text-accent" data-testid="current-time">
                    {currentTime.toLocaleString('pt-BR', {
                      timeZone: 'America/Sao_Paulo',
                      weekday: 'short',
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })}
                  </div>
                </div>

                {/* General Draw Times */}
                <div className="text-center border-t border-border/30 pt-3">
                  <div className="text-xs text-muted-foreground mb-2">Horários dos Sorteios</div>
                  <div className="text-xs">
                    <span className="text-primary font-semibold">Todas as modalidades:</span> 20:00h
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statistics Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-black/20">
            <CardContent className="p-4 text-center">
              <Trophy className="h-8 w-8 mx-auto mb-2 text-primary" />
              <div className="text-2xl font-bold text-primary neon-text" data-testid="total-games-stat">
                {statsLoading ? "..." : userStats?.totalGames || 0}
              </div>
              <div className="text-xs text-muted-foreground">Jogos Realizados</div>
            </CardContent>
          </Card>

          <Card className="bg-black/20">
            <CardContent className="p-4 text-center">
              <Medal className="h-8 w-8 mx-auto mb-2 text-neon-green" />
              <div className="text-2xl font-bold text-neon-green neon-text" data-testid="total-wins-stat">
                {statsLoading ? "..." : userStats?.wins || 0}
              </div>
              <div className="text-xs text-muted-foreground">Prêmios Ganhos</div>
            </CardContent>
          </Card>

          <Card className="bg-black/20">
            <CardContent className="p-4 text-center">
              <BarChart3 className="h-8 w-8 mx-auto mb-2 text-accent" />
              <div className="text-2xl font-bold text-accent neon-text" data-testid="accuracy-stat">
                {statsLoading ? "..." : `${userStats?.accuracy || 0}%`}
              </div>
              <div className="text-xs text-muted-foreground">Taxa de Acerto</div>
            </CardContent>
          </Card>

          <Card className="bg-black/20">
            <CardContent className="p-4 text-center">
              <DollarSign className="h-8 w-8 mx-auto mb-2 text-neon-gold" />
              <div className="text-2xl font-bold text-neon-gold neon-text" data-testid="total-prize-stat">
                R$ {totalPrizeWon.toFixed(2).replace('.', ',')}
              </div>
              <div className="text-xs text-muted-foreground">Total Ganho</div>
            </CardContent>
          </Card>
        </div>

        {/* Best Result Highlight */}
        {bestResult && (
          <Card className="bg-black/20">
            <div className="absolute inset-0 bg-black/20"></div>
            <CardContent className="p-6 relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <Award className="h-8 w-8 text-neon-gold" />
                  <div>
                    <h3 className="text-xl font-bold text-neon-gold neon-text">Melhor Resultado 🏆</h3>
                    <p className="text-sm text-muted-foreground">Seu maior prêmio até agora</p>
                  </div>
                </div>
                <Button
                  onClick={() => {
                    setCelebrationPrize(`R$ ${bestResult.prizeWon}`);
                    setShowCelebration(true);
                  }}
                  variant="outline"
                  size="sm"
                  className="border-neon-gold text-neon-gold hover:bg-neon-gold/10"
                  data-testid="celebrate-best-result-button"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Comemorar
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-neon-gold neon-text" data-testid="best-prize-amount">
                    R$ {parseFloat(bestResult.prizeWon || "0").toFixed(2).replace('.', ',')}
                  </div>
                  <div className="text-sm text-muted-foreground">Valor do Prêmio</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-foreground" data-testid="best-lottery">
                    {getLotteryName(bestResult.lotteryId)}
                  </div>
                  <div className="text-sm text-muted-foreground">Modalidade</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-accent" data-testid="best-matches">
                    {bestResult.matches} / {bestResult.selectedNumbers.length}
                  </div>
                  <div className="text-sm text-muted-foreground">{getPrizeTier(bestResult.lotteryId, bestResult.matches)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card className="bg-black/20 mb-6">
          <CardContent className="p-4">
            <div className="space-y-4">
              <div className="flex items-center space-x-2 mb-3">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filtros:</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {/* Lottery filter */}
                <Select value={filterLottery} onValueChange={setFilterLottery}>
                  <SelectTrigger data-testid="lottery-filter">
                    <SelectValue placeholder="Modalidade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as modalidades</SelectItem>
                    {lotteryTypes?.map((lottery) => (
                      <SelectItem key={lottery.id} value={lottery.id}>
                        {lottery.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Contest search */}
                <div className="flex items-center space-x-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Concurso..."
                    value={searchContest}
                    onChange={(e) => setSearchContest(e.target.value)}
                    className="flex-1"
                    data-testid="contest-search"
                  />
                </div>

                {/* Date filter */}
                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="flex-1"
                    placeholder="Dia"
                    data-testid="date-filter"
                  />
                </div>

                {/* Month/Year filter */}
                <Input
                  type="month"
                  value={filterMonth ? filterMonth.split('/').reverse().join('-') : ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      const [year, month] = e.target.value.split('-');
                      setFilterMonth(`${month}/${year}`);
                    } else {
                      setFilterMonth('');
                    }
                  }}
                  placeholder="Mês/Ano"
                  data-testid="month-filter"
                />

                {/* Time filter */}
                <Input
                  type="time"
                  value={filterTime}
                  onChange={(e) => setFilterTime(e.target.value)}
                  placeholder="Hora"
                  data-testid="time-filter"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Mostrando {filteredGames.length} de {userGames?.length || 0} jogos
                </div>
                {(filterDate || filterMonth || filterYear || filterTime || filterLottery !== 'all' || searchContest) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFilterDate('');
                      setFilterMonth('');
                      setFilterYear('');
                      setFilterTime('');
                      setFilterLottery('all');
                      setSearchContest('');
                    }}
                    data-testid="clear-filters-button"
                  >
                    Limpar filtros
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Games List */}
        <Card className="bg-black/20 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-primary flex items-center">
              <Target className="h-5 w-5 mr-2" />
              Histórico de Jogos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {gamesLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="p-4 bg-black/20 rounded-lg animate-pulse">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-20 h-4 bg-black/20 rounded"></div>
                        <div className="w-16 h-4 bg-black/20 rounded"></div>
                      </div>
                      <div className="w-24 h-4 bg-black/20 rounded"></div>
                    </div>
                    <div className="flex space-x-2 mb-3">
                      {[...Array(6)].map((_, j) => (
                        <div key={j} className="w-10 h-10 bg-black/20 rounded-full"></div>
                      ))}
                    </div>
                    <div className="w-32 h-3 bg-black/20 rounded"></div>
                  </div>
                ))}
              </div>
            ) : filteredGames.length > 0 ? (
              <div className="space-y-4">
                {filteredGames.map((game, index) => {
                  const prizeWon = parseFloat(game.prizeWon || "0");
                  const hasWon = prizeWon > 0;

                  return (
                    <Card key={game.id} className={`bg-black/20 border-border/50 ${hasWon ? 'ring-1 ring-neon-green/30' : ''}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-3">
                            <Badge variant="secondary" className="font-mono">
                              {getLotteryName(game.lotteryId)}
                            </Badge>
                            <Badge variant="outline" className="font-mono" data-testid={`game-${index}-contest`}>
                              #{game.contestNumber}
                            </Badge>
                            <span className="text-xs text-muted-foreground flex items-center">
                              <Calendar className="h-3 w-3 mr-1" />
                              {new Date(game.createdAt).toLocaleDateString('pt-BR')}
                            </span>
                          </div>

                          <div className="text-right">
                            <div className={`text-lg font-bold ${getMatchesColor(game.matches, game.prizeWon || "0")}`} data-testid={`game-${index}-prize`}>
                              {hasWon ? `R$ ${prizeWon.toFixed(2).replace('.', ',')}` : 'R$ 0,00'}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {hasWon ? getPrizeTier(game.lotteryId, game.matches) : 'Sem acerto'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex flex-wrap gap-2">
                            {game.selectedNumbers.map((number) => (
                              <Badge
                                key={number}
                                variant="secondary"
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                  hasWon ? 'bg-neon-green text-black' : 'bg-black/20 text-muted-foreground'
                                }`}
                                data-testid={`game-${index}-number-${number}`}
                              >
                                {number.toString().padStart(2, '0')}
                              </Badge>
                            ))}
                          </div>

                          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                            <span className="flex items-center">
                              <Target className="h-3 w-3 mr-1" />
                              {game.matches} acertos
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {game.strategy}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-12">
                <Trophy className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg mb-2">Nenhum resultado encontrado</p>
                <p className="text-sm mb-6">
                  {userGames?.length === 0 
                    ? "Você ainda não tem jogos realizados"
                    : "Tente ajustar os filtros"
                  }
                </p>
                <Button 
                  onClick={() => window.location.href = '/generator'}
                  className="bg-black/20"
                  data-testid="generate-first-game-button"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Gerar Primeiro Jogo
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        {filteredGames.length > 0 && (
          <div className="text-center mt-8">
            <div className="inline-flex gap-4">
              <Button 
                onClick={() => window.location.href = '/generator'}
                className="bg-black/20"
                data-testid="generate-more-games-button"
              >
                <Zap className="h-4 w-4 mr-2" />
                Gerar Mais Jogos
              </Button>

              <Button 
                onClick={() => window.location.href = '/ai-analysis'}
                variant="outline"
                className="border-secondary text-secondary hover:bg-black/20"
                data-testid="ai-analysis-button"
              >
                <TrendingUp className="h-4 w-4 mr-2" />
                Análise IA
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* Developer Footer */}
      <footer className="text-center py-4 mt-8 border-t border-border/20">
        <p className="text-xs text-muted-foreground">
          powered by <span className="text-accent font-semibold">Shark062</span>
        </p>
      </footer>

      {/* Celebration Animation */}
      <CelebrationAnimation 
        isVisible={showCelebration}
        prizeAmount={celebrationPrize}
        onComplete={() => setShowCelebration(false)}
      />
    </div>
  );
}