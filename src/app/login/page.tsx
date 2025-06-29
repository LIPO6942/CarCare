'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Car, AlertTriangle } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const isFirebaseConfigured =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    !process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID.startsWith('VOTRE_') &&
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    !process.env.NEXT_PUBLIC_FIREBASE_API_KEY.startsWith('VOTRE_');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
     if (!isFirebaseConfigured) {
      toast({
        title: 'Configuration manquante',
        description: "La configuration Firebase est incomplète. Suivez les instructions sur la page.",
        variant: 'destructive',
      });
      return;
    }
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast({ title: 'Succès', description: 'Connexion réussie !' });
      router.push('/');
    } catch (error: any) {
      let description = "Une erreur inattendue est survenue.";
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        description = "L'email ou le mot de passe est incorrect.";
      } else if (error.code === 'auth/invalid-api-key' || error.code === 'auth/api-key-not-valid') {
        description = "La clé d'API Firebase n'est pas valide. Veuillez vérifier votre configuration .env et redémarrer le serveur.";
      }
      toast({
        title: 'Erreur de connexion',
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
          <CardTitle>Connexion</CardTitle>
          <CardDescription>Accédez à votre tableau de bord</CardDescription>
        </CardHeader>
        <CardContent>
           {!isFirebaseConfigured && (
              <div className="mb-4 flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold">Action requise</p>
                  <p>La configuration Firebase est incomplète. Créez un fichier `.env`, copiez le contenu de `.env.example`, et remplacez les valeurs `VOTRE_...` par vos propres clés. Ensuite, redémarrez le serveur.</p>
                </div>
              </div>
            )}
          <form onSubmit={handleLogin} className="space-y-4">
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
            <Button type="submit" className="w-full" disabled={isLoading || !isFirebaseConfigured}>
              {isLoading ? 'Connexion...' : 'Se connecter'}
            </Button>
          </form>
        </CardContent>
         <CardFooter className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Vous n'avez pas de compte ?{' '}
            <Link href="/signup" className="font-semibold text-primary hover:underline">
              Inscrivez-vous
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
