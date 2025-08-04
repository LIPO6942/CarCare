'use client';

import { useState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';
import { suggestMaintenanceTasks } from '@/ai/flows/suggest-maintenance-tasks';
import type { SuggestMaintenanceTasksOutput } from '@/ai/flows/suggest-maintenance-tasks';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Bot, Lightbulb, Loader, Loader2, AlertTriangle, Car, History, Trash2, MoreHorizontal } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { getVehicles, addAiDiagnostic, getAiDiagnosticsForVehicle, deleteAiDiagnostic } from '@/lib/data';
import type { Vehicle, AiDiagnostic } from '@/lib/types';
import { useAuth } from '@/context/auth-context';
import { Skeleton } from './ui/skeleton';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

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
  const { user } = useAuth();
  const { toast } = useToast();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  const [result, setResult] = useState<SuggestMaintenanceTasksOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedComponent, setSelectedComponent] = useState<string>('');
  const [selectedSymptom, setSelectedSymptom] = useState<string>('');
  
  const [history, setHistory] = useState<AiDiagnostic[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [diagnosticToDelete, setDiagnosticToDelete] = useState<AiDiagnostic | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const availableSymptoms = selectedComponent ? componentSymptomsMap[selectedComponent] : [];

  useEffect(() => {
    async function fetchInitialData() {
        if (!user) return;
        setIsLoading(true);
        const userVehicles = await getVehicles(user.uid);
        setVehicles(userVehicles);
        if (userVehicles.length > 0) {
            // Select first vehicle by default
            const firstVehicleId = userVehicles[0].id;
            setSelectedVehicleId(firstVehicleId);
            fetchHistory(firstVehicleId);
        }
        setIsLoading(false);
    }
    fetchInitialData();
  }, [user]);

  const fetchHistory = async (vehicleId: string) => {
      if (!user) return;
      setIsLoadingHistory(true);
      const diagnosticHistory = await getAiDiagnosticsForVehicle(vehicleId, user.uid);
      setHistory(diagnosticHistory);
      setIsLoadingHistory(false);
  };

  const handleVehicleChange = (vehicleId: string) => {
    setSelectedVehicleId(vehicleId);
    setResult(null);
    setError(null);
    setHistory([]);
    fetchHistory(vehicleId);
  }

  const handleComponentChange = (value: string) => {
      setSelectedComponent(value);
      setSelectedSymptom(''); // Reset symptom when component changes
  }

  const handleAction = async (formData: FormData) => {
    setResult(null);
    setError(null);
    
    if (!user) {
        setError("Utilisateur non authentifié.");
        return;
    }
    
    const component = formData.get('component') as string;
    const symptom = formData.get('symptom') as string;
    const details = formData.get('details') as string;

    const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
    if (!selectedVehicle) {
        setError("Veuillez sélectionner un véhicule.");
        return;
    }

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
        const response = await suggestMaintenanceTasks({ 
            brand: selectedVehicle.brand,
            model: selectedVehicle.model,
            issueDescription
        });
        setResult(response);
        
        // Save to history
        await addAiDiagnostic({
            userId: user.uid,
            vehicleId: selectedVehicle.id,
            vehicleInfo: {
                brand: selectedVehicle.brand,
                model: selectedVehicle.model,
                licensePlate: selectedVehicle.licensePlate
            },
            symptoms: { component, symptom, details },
            suggestions: response.suggestedTasks,
            createdAt: new Date().toISOString()
        });
        // Refresh history
        fetchHistory(selectedVehicle.id);

    } catch (e) {
        setError("Une erreur est survenue lors de la communication avec l'assistant IA.");
    }
  };
  
  const handleDelete = async () => {
    if (!diagnosticToDelete || !user) return;
    setIsDeleting(true);
    try {
        await deleteAiDiagnostic(diagnosticToDelete.id);
        toast({ title: 'Succès', description: 'Diagnostic supprimé de l\'historique.' });
        fetchHistory(diagnosticToDelete.vehicleId); // Refresh history
        setDiagnosticToDelete(null);
    } catch(e) {
        toast({ title: 'Erreur', description: 'Impossible de supprimer le diagnostic.', variant: 'destructive' });
    } finally {
        setIsDeleting(false);
    }
  }


  if (isLoading) {
      return (
          <Card className="max-w-2xl mx-auto">
              <CardHeader>
                  <Skeleton className="h-8 w-40" />
                  <Skeleton className="h-4 w-full max-w-sm" />
              </CardHeader>
              <CardContent className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-24 w-full" />
              </CardContent>
              <CardFooter className="flex justify-end">
                  <Skeleton className="h-10 w-48" />
              </CardFooter>
          </Card>
      );
  }

  if (vehicles.length === 0) {
    return (
        <Card className="max-w-2xl mx-auto mt-8">
            <CardHeader>
                <CardTitle>Aucun Véhicule</CardTitle>
                <CardDescription>Vous devez ajouter un véhicule avant de pouvoir utiliser l'assistant IA.</CardDescription>
            </CardHeader>
            <CardContent className="text-center py-12">
                <Car className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <Button asChild>
                    <Link href="/">Retourner au tableau de bord</Link>
                </Button>
            </CardContent>
        </Card>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <Card>
        <form action={handleAction}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-6 w-6" />
              <span>Diagnostic IA</span>
            </CardTitle>
            <CardDescription>
              Guidez l'assistant en sélectionnant votre véhicule et le problème pour obtenir des suggestions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
              <div className="space-y-2">
                  <Label htmlFor="vehicle-select">Véhicule concerné</Label>
                  <Select name="vehicleId" required onValueChange={handleVehicleChange} value={selectedVehicleId}>
                      <SelectTrigger id="vehicle-select">
                          <SelectValue placeholder="Sélectionnez un véhicule" />
                      </SelectTrigger>
                      <SelectContent>
                          {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.brand} {v.model} ({v.licensePlate})</SelectItem>)}
                      </SelectContent>
                  </Select>
              </div>
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
      
      {selectedVehicleId && (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <History className="h-6 w-6" />
                    Historique des Diagnostics
                </CardTitle>
                <CardDescription>Diagnostics précédents pour le véhicule sélectionné.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoadingHistory ? (
                    <div className="flex justify-center items-center py-8">
                        <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : history.length > 0 ? (
                    <div className="space-y-4">
                        {history.map(item => (
                            <div key={item.id} className="border rounded-lg p-4 group relative">
                                <div className="absolute top-2 right-2">
                                     <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-2">
                                            <Button 
                                                variant="ghost" 
                                                className="w-full justify-start text-destructive hover:text-destructive"
                                                onClick={() => setDiagnosticToDelete(item)}
                                            >
                                                <Trash2 className="mr-2 h-4 w-4" /> Supprimer
                                            </Button>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                <p className="text-sm text-muted-foreground mb-2">
                                    {format(new Date(item.createdAt), "d MMMM yyyy 'à' HH:mm", { locale: fr })}
                                </p>
                                <div className="space-y-1">
                                    <p className="text-sm">
                                        <span className="font-semibold">{item.symptoms.component}:</span> {item.symptoms.symptom}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        <span className="font-semibold">Suggestion IA:</span> {item.suggestions[0]}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-12 text-muted-foreground">
                        <p>Aucun diagnostic n'a été enregistré pour ce véhicule.</p>
                    </div>
                )}
            </CardContent>
        </Card>
      )}

      <AlertDialog open={!!diagnosticToDelete} onOpenChange={() => setDiagnosticToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce diagnostic ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible et supprimera cet enregistrement de votre historique.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
