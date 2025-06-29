'use client';

import React, { Component, type ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(_: Error): State {
    // Met à jour l'état pour que le prochain rendu affiche l'interface de secours.
    return { hasError: true, error: _ };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Erreur non interceptée dans ErrorBoundary:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <Card className="border-destructive bg-destructive/5">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                    <AlertTriangle />
                    Une Erreur est Survenue
                </CardTitle>
            </CardHeader>
          <CardContent>
            <p>Impossible d'afficher cette section en raison d'une erreur inattendue.</p>
            <p className="text-sm text-muted-foreground mt-2">
              Cela est probablement dû à des données invalides ou corrompues dans la base de données.
            </p>
            
            {/* Affiche les détails de l'erreur uniquement en environnement de développement pour le débogage */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
                <pre className="mt-4 p-2 bg-muted rounded-md text-xs overflow-auto">
                    {this.state.error.toString()}
                </pre>
            )}
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
