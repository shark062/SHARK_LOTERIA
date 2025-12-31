import React, { useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import HeatMap from "@/pages/HeatMap";
import Generator from "@/pages/Generator";
import Results from "@/pages/Results";
import AIAnalysis from "@/pages/AIAnalysis";
import AIMetrics from "@/pages/AIMetrics";
import Information from "@/pages/Information";
import AdvancedDashboard from "@/components/AdvancedDashboard";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Premium from "@/pages/Premium";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/premium" component={Premium} />
      <Route path="/heat-map" component={HeatMap} />
      <Route path="/generator" component={Generator} />
      <Route path="/results" component={Results} />
      <Route path="/ai-analysis" component={AIAnalysis} />
      <Route path="/ai-metrics" component={AIMetrics} />
      <Route path="/information" component={Information} />
      <Route path="/advanced-dashboard" component={AdvancedDashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Register Service Worker for PWA support
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/service-worker.js')
        .then((registration) => {
          console.log('✅ Service Worker registered:', registration);
        })
        .catch((error) => {
          console.warn('Service Worker registration failed:', error);
        });
    }

    console.log('🦈 Shark Loterias initialized - Premium Edition');
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-black text-foreground">
        <Toaster />
        <Router />
      </div>
    </QueryClientProvider>
  );
}

export default App;