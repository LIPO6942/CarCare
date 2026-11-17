'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { getVehicles } from '@/lib/data';
import type { Vehicle } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Car,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Disc,
  Eye,
  ShieldCheck,
  FileCheck2,
  RotateCcw,
  ExternalLink,
  ChevronLeft,
  CalendarCheck,
  FileText,
  Sparkles,
} from 'lucide-react';

interface ChecklistItem {
  id: string;
  category: string;
  title: string;
  description: string;
  tip: string;
  icon: typeof Lightbulb;
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    id: 'eclairage',
    category: 'Visibilité & Signalisation',
    title: 'Éclairage & Feux',
    description: 'Vérifiez le fonctionnement de tous les feux : croisement, route, stop, clignotants, feux de détresse et éclairage de la plaque.',
    tip: 'Astuce : Demandez à un proche d’observer l’arrière du véhicule pendant que vous freinez et enclenchez la marche arrière.',
    icon: Lightbulb,
  },
  {
    id: 'pneus',
    category: 'Liaison au sol',
    title: 'Pneumatiques & Roue de secours',
    description: 'Vérifiez l’usure de la bande de roulement (témoins non atteints), l’absence de hernie ou coupure sur les flancs, et la pression des 4 pneus + roue de secours.',
    tip: 'Les pneus d’un même essieu doivent être de structure identique et d’usure équivalente.',
    icon: Disc,
  },
  {
    id: 'freinage',
    category: 'Sécurité active',
    title: 'Freinage & Voyants au tableau de bord',
    description: 'Vérifiez le bon maintien du frein à main (course pas trop longue) et assurez-vous qu’aucun voyant d’alerte (ABS, frein, moteur rouge) ne reste allumé.',
    tip: 'Le niveau du liquide de frein doit se situer entre le MIN et le MAX dans le bocal.',
    icon: AlertTriangle,
  },
  {
    id: 'visibilite',
    category: 'Confort & Vision',
    title: 'Essuie-glaces, Lave-glace & Rétroviseurs',
    description: 'Balais d’essuie-glaces en bon état (ne laissent pas de traces), réservoir de lave-glace rempli, pare-brise sans fissure dans le champ de vision et rétroviseurs bien fixés.',
    tip: 'Un simple manque de liquide lave-glace peut être signalé lors du contrôle.',
    icon: Eye,
  },
  {
    id: 'securite',
    category: 'Équipements de bord',
    title: 'Ceintures de sécurité & Klaxon',
    description: 'Testez le verrouillage et le bon ré-enroulement de toutes les ceintures de sécurité (avant et arrière) et assurez-vous du bon fonctionnement du klaxon.',
    tip: 'Ayez également à portée de main votre gilet haute visibilité et le triangle de signalisation.',
    icon: ShieldCheck,
  },
  {
    id: 'documents',
    category: 'Administration',
    title: 'Documents obligatoires à emporter',
    description: 'Munissez-vous des documents originaux en règle : carte grise, reçu du paiement de la vignette fiscale et attestation d’assurance valide.',
    tip: 'Consultez la rubrique Documents de l’application pour vérifier vos justificatifs enregistrés.',
    icon: FileCheck2,
  },
];

export function VisiteTechniqueChecklistClient() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const vehicleIdParam = searchParams.get('vehicleId');

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  // 1. Charger les véhicules
  useEffect(() => {
    async function loadVehicles() {
      if (!user) return;
      setIsLoading(true);
      try {
        const userVehicles = await getVehicles(user.uid);
        setVehicles(userVehicles);

        if (vehicleIdParam && userVehicles.some((v) => v.id === vehicleIdParam)) {
          setSelectedVehicleId(vehicleIdParam);
        } else if (userVehicles.length > 0) {
          setSelectedVehicleId(userVehicles[0].id);
        }
      } catch (err) {
        console.error('Erreur chargement véhicules:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadVehicles();
  }, [user, vehicleIdParam]);

  // 2. Charger les coches pour le véhicule sélectionné depuis le localStorage
  useEffect(() => {
    if (!selectedVehicleId) return;
    try {
      const stored = localStorage.getItem(`carcare_vt_checklist_${selectedVehicleId}`);
      if (stored) {
        setCheckedItems(JSON.parse(stored));
      } else {
        setCheckedItems({});
      }
    } catch (e) {
      console.warn('Erreur lecture checklist locale:', e);
      setCheckedItems({});
    }
  }, [selectedVehicleId]);

  // Sauvegarder les coches dans le localStorage
  const handleToggleItem = (itemId: string) => {
    if (!selectedVehicleId) return;
    setCheckedItems((prev) => {
      const updated = { ...prev, [itemId]: !prev[itemId] };
      try {
        localStorage.setItem(`carcare_vt_checklist_${selectedVehicleId}`, JSON.stringify(updated));
      } catch (e) {
        console.warn('Erreur écriture checklist locale:', e);
      }
      return updated;
    });
  };

  const handleResetChecklist = () => {
    if (!selectedVehicleId) return;
    setCheckedItems({});
    try {
      localStorage.removeItem(`carcare_vt_checklist_${selectedVehicleId}`);
    } catch (e) {
      console.warn('Erreur reset checklist:', e);
    }
  };

  const handleCheckAll = () => {
    if (!selectedVehicleId) return;
    const allChecked: Record<string, boolean> = {};
    CHECKLIST_ITEMS.forEach((item) => {
      allChecked[item.id] = true;
    });
    setCheckedItems(allChecked);
    try {
      localStorage.setItem(`carcare_vt_checklist_${selectedVehicleId}`, JSON.stringify(allChecked));
    } catch (e) {
      console.warn('Erreur check all checklist:', e);
    }
  };

  const selectedVehicle = useMemo(() => {
    return vehicles.find((v) => v.id === selectedVehicleId) || null;
  }, [vehicles, selectedVehicleId]);

  const completedCount = useMemo(() => {
    return CHECKLIST_ITEMS.filter((item) => checkedItems[item.id]).length;
  }, [checkedItems]);

  const totalCount = CHECKLIST_ITEMS.length;
  const progressPercent = Math.round((completedCount / totalCount) * 100);
  const isAllCompleted = completedCount === totalCount;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[350px] gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Chargement de votre checklist...</p>
      </div>
    );
  }

  if (vehicles.length === 0) {
    return (
      <Card className="max-w-xl mx-auto my-8 text-center p-6">
        <CardHeader>
          <div className="mx-auto p-3 rounded-full bg-muted w-fit mb-2">
            <Car className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle>Aucun véhicule enregistré</CardTitle>
          <CardDescription>
            Veuillez d’abord ajouter un véhicule pour accéder à sa checklist de visite technique.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Button asChild>
            <Link href="/">Ajouter un véhicule</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Navigation retour & sélecteur de véhicule */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2">
        <Button variant="ghost" size="sm" asChild className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground">
          <Link href={selectedVehicleId ? `/?vehicleId=${selectedVehicleId}` : '/'}>
            <ChevronLeft className="h-4 w-4" />
            Retour au tableau de bord
          </Link>
        </Button>

        {vehicles.length > 1 && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Véhicule :</span>
            <Select value={selectedVehicleId || ''} onValueChange={setSelectedVehicleId}>
              <SelectTrigger className="w-full sm:w-[240px] h-9">
                <SelectValue placeholder="Choisir un véhicule" />
              </SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.brand} {v.model} ({v.licensePlate || 'Sans immat.'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Bannière principale récapitulative */}
      <Card className="border-primary/20 bg-gradient-to-br from-background via-background to-primary/5 shadow-md overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500" />
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-blue-500/40 text-blue-600 dark:text-blue-400 font-semibold text-xs">
                  Pré-contrôle technique
                </Badge>
                {isAllCompleted ? (
                  <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs">
                    <CheckCircle2 className="h-3 w-3" /> Prêt pour la visite
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    {completedCount} / {totalCount} vérifiés
                  </Badge>
                )}
              </div>
              <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">
                Checklist avant visite technique
              </CardTitle>
              {selectedVehicle && (
                <p className="text-sm text-muted-foreground font-medium">
                  Pour votre <span className="font-semibold text-foreground">{selectedVehicle.brand} {selectedVehicle.model}</span>
                  {selectedVehicle.licensePlate && ` (${selectedVehicle.licensePlate})`}
                </p>
              )}
            </div>

            {/* Actions rapides */}
            <div className="flex items-center gap-2 self-start sm:self-center">
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetChecklist}
                className="text-xs h-8 gap-1.5"
                title="Décocher toutes les cases"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Réinitialiser
              </Button>
              {!isAllCompleted && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCheckAll}
                  className="text-xs h-8 gap-1.5"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Tout cocher
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Progression des vérifications</span>
              <span className="font-semibold text-foreground">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-2.5" />
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Cette liste regroupe les 6 points simples et essentiels causant le plus fréquemment un refus ou une contre-visite.
            Prenez 10 minutes pour faire le tour de votre voiture avant de vous rendre au centre de contrôle technique.
          </p>
        </CardContent>
      </Card>

      {/* Liste des items de contrôle */}
      <div className="grid gap-3 sm:gap-4">
        {CHECKLIST_ITEMS.map((item, index) => {
          const isChecked = !!checkedItems[item.id];
          const IconComponent = item.icon;

          return (
            <Card
              key={item.id}
              onClick={() => handleToggleItem(item.id)}
              className={`cursor-pointer transition-all duration-200 hover:shadow-md border ${
                isChecked
                  ? 'border-emerald-500/40 bg-emerald-50/30 dark:bg-emerald-950/10'
                  : 'hover:border-primary/40'
              }`}
            >
              <CardContent className="p-4 sm:p-5 flex items-start gap-3.5 sm:gap-4">
                <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    id={`check-${item.id}`}
                    checked={isChecked}
                    onCheckedChange={() => handleToggleItem(item.id)}
                    className="h-5 w-5 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                  />
                </div>

                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {index + 1}. {item.category}
                    </span>
                    {isChecked && (
                      <Badge variant="outline" className="border-emerald-500/50 text-emerald-600 dark:text-emerald-400 text-[10px] py-0 px-1.5 h-4">
                        Vérifié
                      </Badge>
                    )}
                  </div>

                  <h3 className={`text-base font-semibold leading-snug ${isChecked ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                    {item.title}
                  </h3>

                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>

                  <div className="pt-1 flex items-start gap-1.5 text-xs text-muted-foreground/90 bg-muted/40 p-2 rounded-lg border border-border/40">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <span>{item.tip}</span>
                  </div>
                </div>

                <div
                  className={`p-2.5 rounded-xl shrink-0 transition-colors ${
                    isChecked
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <IconComponent className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Raccourcis et liens utiles */}
      <Card className="bg-muted/30 border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-primary" />
            Actions utiles & Préparation du RDV
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-0">
          {selectedVehicleId && (
            <Button variant="outline" asChild className="w-full justify-start text-xs h-10 gap-2">
              <Link href={`/documents?vehicleId=${selectedVehicleId}`}>
                <FileText className="h-4 w-4 text-blue-500" />
                Vérifier mes documents (carte grise, vignette...)
              </Link>
            </Button>
          )}

          <Button variant="outline" asChild className="w-full justify-start text-xs h-10 gap-2">
            <a
              href="http://www.attt.com.tn/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center"
            >
              <ExternalLink className="h-4 w-4 text-emerald-500" />
              Prendre rendez-vous en ligne (ATTT)
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
