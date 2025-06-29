'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Car, AlertTriangle } from 'lucide-react';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  
  const isFirebaseConfigured =
    !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
     if (!isFirebaseConfigured) {
      toast({
        title: 'Configuration manquante',
        description: "Configuration Firebase manquante. Consultez les instructions sur la page pour résoudre ce problème.",
        variant: 'destructive',
      });
      return;
    }
    if (password !== confirmPassword) {
      toast({
        title: 'Erreur',
        description: 'Les mots de passe ne correspondent pas.',
        variant: 'destructive',
      });
      return;
    }
    setIsLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      toast({ title: 'Succès', description: 'Compte créé avec succès !' });
      router.push('/');
    } catch (error: any) {
        let description = 'Une erreur est survenue.';
        if (error.code === 'auth/email-already-in-use') {
            description = 'Cet email est déjà utilisé par un autre compte.';
        } else if (error.code === 'auth/weak-password') {
            description = 'Le mot de passe doit contenir au moins 6 caractères.';
        } else if (error.code === 'auth/invalid-api-key' || error.code === 'auth/api-key-not-valid') {
            description = "La clé d'API Firebase n'est pas valide. Veuillez vérifier votre configuration .env.";
        } else {
            console.error(error);
        }
      toast({
        title: 'Erreur d\'inscription',
        description,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center items-center gap-2 mb-4">
                <Car className="h-8 w-8 text-primary" />
                <span className="text-2xl font-bold text-foreground">CarCare Pro</span>
            </div>
          <CardTitle>Créer un compte</CardTitle>
          <CardDescription>Rejoignez CarCare Pro pour gérer vos véhicules.</CardDescription>
        </CardHeader>
        <CardContent>
           {!isFirebaseConfigured && (
              <div className="mb-4 flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold">Action requise</p>
                   <p>La configuration Firebase est incomplète. Veuillez créer un fichier `.env` en copiant le modèle `.env.example` et en le remplissant avec vos clés. Sans cela, l'authentification ne peut pas fonctionner.</p>
                </div>
              </div>
            )}
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="m@exemple.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!isFirebaseConfigured}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!isFirebaseConfigured}
              />
            </div>
             <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmer le mot de passe</Label>
              <Input
                id="confirm-password"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={!isFirebaseConfigured}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading || !isFirebaseConfigured}>
              {isLoading ? 'Création...' : 'S\'inscrire'}
            </Button>
          </form>
        </CardContent>
         <CardFooter className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Vous avez déjà un compte ?{' '}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Connectez-vous
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
