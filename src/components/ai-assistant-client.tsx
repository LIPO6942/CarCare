'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { suggestMaintenanceTasks } from '@/ai/flows/suggest-maintenance-tasks';
import type { SuggestMaintenanceTasksOutput } from '@/ai/flows/suggest-maintenance-tasks';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Bot, Lightbulb, Loader, AlertTriangle } from 'lucide-react';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <>
          <Loader className="mr-2 h-4 w-4 animate-spin" />
          Analyse en cours...
        </>
      ) : (
        <>
          <Lightbulb className="mr-2 h-4 w-4" />
          Obtenir des suggestions
        </>
      )}
    </Button>
  );
}

export default function AiAssistantClient() {
  const [result, setResult] = useState<SuggestMaintenanceTasksOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAction = async (formData: FormData) => {
    setResult(null);
    setError(null);
    const issueDescription = formData.get('issueDescription') as string;
    if (!issueDescription) {
        setError("Veuillez décrire votre problème.");
        return;
    }
    try {
        const response = await suggestMaintenanceTasks({ issueDescription });
        setResult(response);
    } catch (e) {
        setError("Une erreur est survenue lors de la communication avec l'assistant IA.");
    }
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <form action={handleAction}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-6 w-6" />
            <span>Diagnostic IA</span>
          </CardTitle>
          <CardDescription>
            Décrivez en détail le problème que vous rencontrez (bruits, voyants, comportement...).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            name="issueDescription"
            placeholder="Ex: Ma voiture fait un bruit de claquement quand je tourne à droite, surtout à basse vitesse..."
            rows={5}
            required
            className="text-base"
          />
        </CardContent>
        <CardFooter className="flex justify-end">
          <SubmitButton />
        </CardFooter>
      </form>

      {error && (
        <div className="p-4 m-6 mt-0 border border-destructive/50 bg-destructive/10 rounded-lg text-destructive flex items-center gap-3">
          <AlertTriangle className="h-5 w-5" />
          <p>{error}</p>
        </div>
      )}

      {result && result.suggestedTasks.length > 0 && (
        <div className="p-6 pt-0">
            <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-4">Suggestions de l'IA</h3>
                <ul className="list-disc pl-5 space-y-2 bg-primary/5 p-4 rounded-md">
                    {result.suggestedTasks.map((task, index) => (
                    <li key={index} className="text-foreground/90">{task}</li>
                    ))}
                </ul>
            </div>
        </div>
      )}
    </Card>
  );
}
