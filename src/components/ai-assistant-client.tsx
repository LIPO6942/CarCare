'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { suggestMaintenanceTasks } from '@/ai/flows/suggest-maintenance-tasks';
import type { SuggestMaintenanceTasksOutput } from '@/ai/flows/suggest-maintenance-tasks';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Bot, Lightbulb, Loader, AlertTriangle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';


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

const componentSymptomsMap: Record<string, string[]> = {
  "Moteur": ["Bruit anormal", "Vibration", "Perte de puissance", "Voyant moteur allumé", "Fumée anormale", "Surchauffe", "Difficulté à démarrer"],
  "Freins": ["Bruit de grincement/sifflement", "Pédale de frein molle", "Vibrations au freinage", "Distance de freinage allongée", "Voyant de frein allumé"],
  "Roues & Pneus": ["Vibration dans le volant", "Usure irrégulière des pneus", "Pneu dégonflé", "Bruit de roulement"],
  "Suspension & Direction": ["Tenue de route floue", "Bruits de claquement", "Volant de travers", "Vibrations"],
  "Carrosserie": ["Rouille", "Peinture écaillée", "Porte/coffre qui ferme mal", "Infiltration d'eau"],
  "Électricité & Batterie": ["Difficulté à démarrer", "Phares faibles", "Voyants qui clignotent", "Accessoires qui ne fonctionnent pas", "Batterie à plat"],
  "Climatisation": ["Pas d'air froid", "Mauvaise odeur", "Bruit du compresseur", "Fuite de liquide"],
  "Transmission": ["Changements de vitesse difficiles", "Patinage de l'embrayage", "Bruit en point mort", "Fuite de liquide"],
  "Échappement": ["Bruit excessif", "Odeur de gaz", "Fumée colorée", "Perte de puissance"],
  "Intérieur": ["Siège abîmé", "Bouton cassé", "Bruit de plastique", "Tableau de bord fissuré"],
  "Autre": ["Symptôme non listé"],
};

const carComponents = Object.keys(componentSymptomsMap);


export default function AiAssistantClient() {
  const [result, setResult] = useState<SuggestMaintenanceTasksOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedComponent, setSelectedComponent] = useState<string>('');
  const [selectedSymptom, setSelectedSymptom] = useState<string>('');
  
  const availableSymptoms = selectedComponent ? componentSymptomsMap[selectedComponent] : [];

  const handleComponentChange = (value: string) => {
      setSelectedComponent(value);
      setSelectedSymptom(''); // Reset symptom when component changes
  }

  const handleAction = async (formData: FormData) => {
    setResult(null);
    setError(null);
    
    const component = formData.get('component') as string;
    const symptom = formData.get('symptom') as string;
    const details = formData.get('details') as string;

    if (!component || !symptom) {
        setError("Veuillez sélectionner un composant et un symptôme.");
        return;
    }

    const issueDescription = `
      Composant concerné: ${component}.
      Symptôme principal: ${symptom}.
      ${details ? `Détails supplémentaires: ${details}` : ''}
    `;

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
            Guidez l'assistant en sélectionnant les options puis décrivez votre problème pour obtenir des suggestions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                <Label htmlFor="component-select">Composant principal</Label>
                <Select name="component" required onValueChange={handleComponentChange} value={selectedComponent}>
                    <SelectTrigger id="component-select">
                    <SelectValue placeholder="Sélectionnez un composant" />
                    </SelectTrigger>
                    <SelectContent>
                    {carComponents.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                </Select>
                </div>
                <div className="space-y-2">
                <Label htmlFor="symptom-select">Symptôme principal</Label>
                <Select name="symptom" required disabled={!selectedComponent} onValueChange={setSelectedSymptom} value={selectedSymptom}>
                    <SelectTrigger id="symptom-select">
                    <SelectValue placeholder={selectedComponent ? "Sélectionnez un symptôme" : "Choisissez d'abord un composant"} />
                    </SelectTrigger>
                    <SelectContent>
                    {availableSymptoms.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                </Select>
                </div>
            </div>
            <div>
                <Label htmlFor="details-textarea">Détails supplémentaires (optionnel)</Label>
                <Textarea
                id="details-textarea"
                name="details"
                placeholder="Ex: Le bruit se produit uniquement en tournant à droite, à basse vitesse..."
                rows={4}
                className="mt-2 text-base"
                />
            </div>
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
