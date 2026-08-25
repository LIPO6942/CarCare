'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { getSettings, saveSettings, type AppSettings, type VignetteCost } from '@/lib/settings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Bell, BellOff, Loader2, LogIn, UserPlus, LogOut, ShieldCheck, Send, BellRing, RefreshCw } from 'lucide-react';
import type { Vehicle } from '@/lib/types';
import { getVehicles } from '@/lib/data';
import { useAuth } from '@/context/auth-context';
import { auth } from '@/lib/firebase';
import { EmailAuthProvider, linkWithCredential, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { Skeleton } from './ui/skeleton';
import { useNotifications } from '@/hooks/use-notifications';
import { PlacesManager } from './places-manager';


const VignetteCostSchema = z.object({
    range: z.string(),
    cost: z.coerce.number().min(0),
});

const SettingsSchema = z.object({
    priceEssence: z.coerce.number().min(0, 'Le prix doit être positif'),
    priceDiesel: z.coerce.number().min(0, 'Le prix doit être positif'),
    costVisiteTechnique: z.coerce.number().min(0, 'Le coût doit être positif'),
    vignetteEssence: z.array(VignetteCostSchema),
    vignetteDiesel: z.array(VignetteCostSchema),
});

type SettingsFormData = z.infer<typeof SettingsSchema>;

function NotificationSettingsCard() {
    const { requestPermission, testNotification, isPermissionGranted, isRequesting, isTesting, permissionStatus } = useNotifications();

    if (isPermissionGranted === null) {
        return null; // Don't render until we know the permission status
    }

    const isBlocked = permissionStatus === 'denied';

    return (
        <Card className="max-w-4xl mx-auto shadow-sm">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <BellRing className="h-5 w-5 text-primary" />
                    <CardTitle>Notifications Push & Rappels d'Entretien</CardTitle>
                </div>
                <CardDescription>
                    Recevez des alertes automatiques à l'avance (J-15, J-7, J-3, Jour J) pour vos vignettes, vidanges, contrôles techniques et assurances.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {isPermissionGranted ? (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-green-50 text-green-800 border border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-green-100 dark:bg-green-900 rounded-full">
                                <Bell className="h-5 w-5 text-green-600 dark:text-green-400" />
                            </div>
                            <div>
                                <h4 className="font-semibold text-sm sm:text-base">Les notifications push sont actives</h4>
                                <p className="text-xs sm:text-sm text-green-700 dark:text-green-400">Votre appareil est enregistré pour recevoir les rappels d'échéances en temps voulu.</p>
                            </div>
                        </div>
                    </div>
                ) : isBlocked ? (
                    <div className="flex items-center gap-4 p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
                        <BellOff className="h-6 w-6 shrink-0" />
                        <div>
                            <h4 className="font-semibold">Les notifications sont bloquées par votre navigateur.</h4>
                            <p className="text-sm">Pour les réactiver, veuillez autoriser les notifications dans les paramètres de votre navigateur pour ce site.</p>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-4 p-4 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
                        <BellOff className="h-6 w-6 text-amber-600 shrink-0" />
                        <div>
                            <h4 className="font-semibold">Les notifications ne sont pas activées.</h4>
                            <p className="text-sm">Autorisez les notifications pour recevoir les alertes d'entretien même lorsque l'application est fermée.</p>
                        </div>
                    </div>
                )}
            </CardContent>
            <CardFooter className="flex flex-wrap items-center gap-3 border-t bg-muted/20 px-6 py-4">
                {isPermissionGranted ? (
                    <>
                        <Button 
                            variant="default" 
                            onClick={testNotification} 
                            disabled={isTesting}
                            className="gap-2"
                        >
                            {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            {isTesting ? 'Envoi du test...' : 'Tester la notification push'}
                        </Button>
                        <Button 
                            variant="outline" 
                            size="sm"
                            onClick={requestPermission} 
                            disabled={isRequesting}
                            className="gap-2 text-muted-foreground"
                            title="Resynchroniser le token de notification de cet appareil"
                        >
                            {isRequesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            Resynchroniser le token
                        </Button>
                    </>
                ) : !isBlocked ? (
                    <Button onClick={requestPermission} disabled={isRequesting} className="gap-2">
                        {isRequesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                        {isRequesting ? 'Activation en cours...' : 'Activer les notifications push'}
                    </Button>
                ) : null}
            </CardFooter>
        </Card>
    );
}

function AccountSettingsCard() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [mode, setMode] = useState<'view' | 'login' | 'register'>('view');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const handleAction = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        
        setIsLoading(true);
        try {
            if (mode === 'register') {
                // Link current anonymous account to email/password
                const credential = EmailAuthProvider.credential(email, password);
                await linkWithCredential(user, credential);
                toast({
                    title: 'Compte sécurisé !',
                    description: 'Vos données sont maintenant sauvegardées sur ce compte.',
                });
                setMode('view');
            } else if (mode === 'login') {
                // Sign in to an existing account (replaces anonymous account)
                await signInWithEmailAndPassword(auth, email, password);
                toast({
                    title: 'Connexion réussie',
                    description: 'Vos données ont été synchronisées.',
                });
                setMode('view');
            }
        } catch (error: any) {
            console.error(error);
            let message = "Une erreur est survenue.";
            if (error.code === 'auth/email-already-in-use') message = "Cet email est déjà utilisé.";
            if (error.code === 'auth/invalid-credential') message = "Email ou mot de passe incorrect.";
            if (error.code === 'auth/weak-password') message = "Le mot de passe doit faire au moins 6 caractères.";
            
            toast({
                title: 'Erreur',
                description: message,
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSignOut = async () => {
        try {
            await signOut(auth);
            toast({
                title: 'Déconnexion',
                description: 'Vous êtes maintenant en mode visiteur.',
            });
        } catch (error) {
            toast({
                title: 'Erreur',
                description: "Impossible de se déconnecter.",
                variant: 'destructive',
            });
        }
    };

    if (!user) return null;

    if (!user.isAnonymous) {
        return (
            <Card className="max-w-4xl mx-auto">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-primary" />
                        Compte Sécurisé
                    </CardTitle>
                    <CardDescription>
                        Vos données sont sauvegardées et synchronisées en toute sécurité.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-lg bg-primary/5 border border-primary/20">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Connecté en tant que :</p>
                            <p className="font-semibold text-primary">{user.email}</p>
                        </div>
                        <Button variant="outline" onClick={handleSignOut}>
                            <LogOut className="mr-2 h-4 w-4" />
                            Se déconnecter
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (mode === 'view') {
        return (
            <Card className="max-w-4xl mx-auto border-amber-200 dark:border-amber-900/50">
                <CardHeader className="bg-amber-50/50 dark:bg-amber-950/20 rounded-t-xl">
                    <CardTitle className="text-amber-800 dark:text-amber-500">Sécurisez vos données</CardTitle>
                    <CardDescription className="text-amber-700/80 dark:text-amber-400/80">
                        Vous utilisez actuellement un compte visiteur temporaire. Si vous changez d'appareil ou videz votre cache, vous perdrez vos données.
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6 flex flex-col sm:flex-row gap-4">
                    <Button onClick={() => setMode('register')} className="flex-1">
                        <UserPlus className="mr-2 h-4 w-4" />
                        Créer un compte (Sauvegarder mes données)
                    </Button>
                    <Button variant="outline" onClick={() => setMode('login')} className="flex-1">
                        <LogIn className="mr-2 h-4 w-4" />
                        J'ai déjà un compte (Me connecter)
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="max-w-4xl mx-auto">
            <CardHeader>
                <CardTitle>
                    {mode === 'register' ? 'Créer un compte' : 'Se connecter'}
                </CardTitle>
                <CardDescription>
                    {mode === 'register' 
                        ? 'Liez une adresse email à vos données actuelles pour les sécuriser.' 
                        : 'Connectez-vous pour retrouver vos données. (Vos données temporaires actuelles seront remplacées).'}
                </CardDescription>
            </CardHeader>
            <form onSubmit={handleAction}>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Adresse Email</Label>
                        <Input 
                            id="email" 
                            type="email" 
                            required 
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password">Mot de passe</Label>
                        <Input 
                            id="password" 
                            type="password" 
                            required 
                            minLength={6}
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                        />
                    </div>
                </CardContent>
                <CardFooter className="flex justify-between">
                    <Button variant="ghost" type="button" onClick={() => setMode('view')}>
                        Annuler
                    </Button>
                    <Button type="submit" disabled={isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {mode === 'register' ? "Enregistrer mon compte" : "Me connecter"}
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
}

export function SettingsClient() {
    const { toast } = useToast();
    const { user } = useAuth();
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const { register, handleSubmit, reset, control, formState: { isSubmitting, errors }, setValue, watch } = useForm<SettingsFormData>({
        resolver: zodResolver(SettingsSchema),
        defaultValues: getSettings(),
    });

    const vignetteEssence = watch('vignetteEssence');
    const vignetteDiesel = watch('vignetteDiesel');

    useEffect(() => {
        async function loadData() {
            if (!user) {
                setIsLoading(false);
                return;
            };

            const [settingsData, vehiclesData] = await Promise.all([
                getSettings(),
                getVehicles(user.uid)
            ]);

            reset(settingsData);
            setVehicles(vehiclesData);
            setIsLoading(false);
        }
        loadData();
    }, [user, reset]);

    const onSubmit: SubmitHandler<SettingsFormData> = (data) => {
        try {
            saveSettings(data);
            toast({
                title: 'Succès',
                description: 'Vos paramètres ont été enregistrés.',
            });
        } catch (error) {
            toast({
                title: 'Erreur',
                description: "Impossible d'enregistrer les paramètres.",
                variant: 'destructive',
            });
        }
    };

    const relevantVignetteFields = useMemo(() => {
        const fields: { label: string, fieldName: `vignetteEssence.${number}.cost` | `vignetteDiesel.${number}.cost` }[] = [];
        const addedRanges = new Set<string>();

        vehicles.forEach(v => {
            if (!v.fiscalPower) return;

            const table = v.fuelType === 'Diesel' ? vignetteDiesel : vignetteEssence;
            const fieldNamePrefix = v.fuelType === 'Diesel' ? 'vignetteDiesel' : 'vignetteEssence';

            const powerRangeIndex = table.findIndex(field => {
                if (v.fiscalPower === undefined) return false;
                if (field.range.includes('-')) {
                    const [min, max] = field.range.split('-').map(Number);
                    return v.fiscalPower >= min && v.fiscalPower <= max;
                }
                return Number(field.range) === v.fiscalPower;
            });

            if (powerRangeIndex !== -1) {
                const range = table[powerRangeIndex].range;
                const key = `${v.fuelType}-${range}`;
                if (!addedRanges.has(key)) {
                    fields.push({
                        label: `${v.fuelType} (${range} CV)`,
                        fieldName: `${fieldNamePrefix}.${powerRangeIndex}.cost` as any,
                    });
                    addedRanges.add(key);
                }
            }
        });

        return fields;
    }, [vehicles, vignetteEssence, vignetteDiesel]);


    if (isLoading) {
        return (
            <div className="space-y-6">
                <Card className="max-w-4xl mx-auto">
                    <CardHeader>
                        <Skeleton className="h-8 w-48" />
                        <Skeleton className="h-4 w-full max-w-md" />
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <Skeleton className="h-32 w-full" />
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-48 w-full" />
                    </CardContent>
                    <CardFooter>
                        <Skeleton className="h-10 w-48" />
                    </CardFooter>
                </Card>
                <Card className="max-w-4xl mx-auto">
                    <CardHeader>
                        <Skeleton className="h-8 w-40" />
                        <Skeleton className="h-4 w-full max-w-lg" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-10 w-52" />
                    </CardContent>
                </Card>
            </div>
        )
    }

    const hasRelevantVignettes = relevantVignetteFields.length > 0;

    return (
        <div className="space-y-6">
            <AccountSettingsCard />
            <NotificationSettingsCard />
            <PlacesManager />
            <Card className="max-w-4xl mx-auto">
                <form onSubmit={handleSubmit(onSubmit)}>
                    <CardHeader>
                        <CardTitle>Valeurs par Défaut</CardTitle>
                        <CardDescription>
                            Définissez les prix et coûts utilisés par défaut lors de l'ajout de nouvelles entrées.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-4 rounded-md border p-4">
                            <h4 className="text-base font-semibold">Prix des Carburants</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="priceEssence">Prix / Litre Essence (TND)</Label>
                                    <Input id="priceEssence" type="number" step="0.001" {...register('priceEssence')} />
                                    {errors.priceEssence && <p className="text-sm text-destructive">{errors.priceEssence.message}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="priceDiesel">Prix / Litre Diesel (TND)</Label>
                                    <Input id="priceDiesel" type="number" step="0.001" {...register('priceDiesel')} />
                                    {errors.priceDiesel && <p className="text-sm text-destructive">{errors.priceDiesel.message}</p>}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4 rounded-md border p-4">
                            <h4 className="text-base font-semibold">Coûts des Entretiens</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                                <div className="space-y-2">
                                    <Label htmlFor="costVisiteTechnique">Coût Visite Technique (TND)</Label>
                                    <Input id="costVisiteTechnique" type="number" step="0.001" {...register('costVisiteTechnique')} />
                                    {errors.costVisiteTechnique && <p className="text-sm text-destructive">{errors.costVisiteTechnique.message}</p>}
                                </div>
                                {hasRelevantVignettes && (
                                    <div className="space-y-2">
                                        <Label>Coûts Vignette Personnalisés</Label>
                                        <p className="text-xs text-muted-foreground pb-2">
                                            Modifiez ici les coûts de la vignette pour les véhicules de votre garage.
                                        </p>
                                        <div className="space-y-2">
                                            {relevantVignetteFields.map(field => (
                                                <div key={field.fieldName} className="flex items-center gap-4">
                                                    <Label className="flex-1" htmlFor={field.fieldName}>
                                                        {field.label}
                                                    </Label>
                                                    <Input
                                                        id={field.fieldName}
                                                        type="number"
                                                        step="0.001"
                                                        className="max-w-[120px]"
                                                        {...register(field.fieldName)}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                    </CardContent>
                    <CardFooter>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Enregistrer les paramètres
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
