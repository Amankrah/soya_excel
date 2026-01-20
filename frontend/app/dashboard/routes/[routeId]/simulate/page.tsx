'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { RouteSimulation } from '@/components/route/route-simulation';

export default function RouteSimulationPage() {
  const params = useParams();
  const router = useRouter();
  const routeId = params.routeId as string;
  const [routeName, setRouteName] = useState<string>('Route Simulation');

  useEffect(() => {
    // Get route name from URL search params if available
    const searchParams = new URLSearchParams(window.location.search);
    const name = searchParams.get('name');
    if (name) {
      setRouteName(name);
    }
  }, []);

  return (
    <div className="h-screen w-full bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-slate-800/50 border-b border-slate-700/50">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="text-slate-300 hover:text-white hover:bg-slate-700/50"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Routes
          </Button>
          <div className="h-6 w-px bg-slate-600/50" />
          <h1 className="text-lg font-semibold text-white">{routeName}</h1>
        </div>
      </div>

      {/* Simulation Component */}
      <div className="flex-1 overflow-hidden">
        <RouteSimulation routeId={routeId} routeName={routeName} />
      </div>
    </div>
  );
}
