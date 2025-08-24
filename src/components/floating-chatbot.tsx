'use client';

import { useState, useRef, useEffect, useCallback, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Bot, User, Send, Loader2, X, AlertTriangle, Car } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { getVehicles } from '@/lib/data';
import type { Vehicle } from '@/lib/types';
import { Textarea } from './ui/textarea';
import { answerVehicleQuestion } from '@/ai/flows/vehicle-data-chatbot';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ScrollArea } from './ui/scroll-area';
import { Skeleton } from './ui/skeleton';
import { cn } from '@/lib/utils';
import Link from 'next/link';

type ChatMessage = {
    role: 'user' | 'model';
    content: string;
};

export function FloatingChatbot() {
    const { user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
    const [isLoadingVehicles, setIsLoadingVehicles] = useState(true);

    const [conversation, setConversation] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const scrollAreaRef = useRef<HTMLDivElement>(null);


    const fetchVehicles = useCallback(async () => {
        if (!user) return;
        setIsLoadingVehicles(true);
        const userVehicles = await getVehicles(user.uid);
        setVehicles(userVehicles);
        if (userVehicles.length > 0) {
            setSelectedVehicleId(userVehicles[0].id);
        }
        setIsLoadingVehicles(false);
    }, [user]);
    
    useEffect(() => {
        if (isOpen) {
            fetchVehicles();
            setConversation([]); // Reset conversation on open
            setError(null);
        }
    }, [isOpen, fetchVehicles]);

    useEffect(() => {
        // Auto scroll to bottom
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTo({
                top: scrollAreaRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, [conversation]);

    const handleSubmit = async () => {
        if (!input.trim() || isGenerating || !selectedVehicleId) return;

        const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
        if (!user || !selectedVehicle) {
            setError("Impossible d'envoyer le message. Utilisateur ou véhicule non valide.");
            return;
        }

        const currentInput = input;
        const newConversation: ChatMessage[] = [...conversation, { role: 'user', content: currentInput }];
        
        setConversation(newConversation);
        setInput('');
        setIsGenerating(true);
        setError(null);

        try {
            const response = await answerVehicleQuestion({
                userId: user.uid,
                vehicle: selectedVehicle,
                history: newConversation.slice(0, -1), // Send history *before* the new question
                question: currentInput,
            });

            const modelMessage: ChatMessage = { role: 'model', content: response.answer };
            setConversation(prev => [...prev, modelMessage]);

        } catch (err) {
            console.error(err);
            const errorMessage = err instanceof Error ? err.message : "Une erreur inconnue est survenue.";
            setError(`Désolé, une erreur est survenue lors de la communication avec le copilote IA. Détails : ${errorMessage}`);
            // If there's an error, restore the user's input so they don't lose it
            setConversation(newConversation.slice(0,-1));
            setInput(currentInput);
        } finally {
            setIsGenerating(false);
        }
    };
    
    const handleVehicleChange = (vehicleId: string) => {
        setSelectedVehicleId(vehicleId);
        setConversation([]); // Reset conversation when vehicle changes
        setError(null);
    }
    
    const ChatbotContent = () => {
        if (isLoadingVehicles) {
            return (
                <div className="p-4 space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <div className="flex-1 space-y-4">
                        <Skeleton className="h-16 w-3/4" />
                        <Skeleton className="h-16 w-3/4 ml-auto" />
                    </div>
                </div>
            )
        }
        
        if (vehicles.length === 0) {
            return (
                 <div className="flex flex-col items-center justify-center h-full text-center p-4">
                    <Car className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="font-semibold">Aucun véhicule trouvé.</p>
                    <p className="text-sm text-muted-foreground mb-4">Veuillez ajouter un véhicule sur le tableau de bord pour utiliser le copilote.</p>
                    <Button asChild onClick={() => setIsOpen(false)}>
                        <Link href="/">Aller au tableau de bord</Link>
                    </Button>
                </div>
            )
        }

        return (
            <div className="h-full flex flex-col">
                <div className="p-4 border-b">
                    <Select onValueChange={handleVehicleChange} value={selectedVehicleId}>
                        <SelectTrigger>
                            <SelectValue placeholder="Sélectionnez un véhicule" />
                        </SelectTrigger>
                        <SelectContent>
                            {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.brand} {v.model}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <ScrollArea className="flex-1" ref={scrollAreaRef as any}>
                    <div className="p-4 space-y-4">
                        {conversation.length === 0 && (
                             <div className="flex items-start gap-4 p-4 rounded-lg bg-primary/5 text-primary-foreground">
                                <div className="p-2 bg-primary/20 rounded-full">
                                    <Bot className="h-6 w-6 text-primary" />
                                </div>
                                <div className="text-sm text-primary/90">
                                    <p className="font-semibold mb-2">Bonjour ! Je suis votre copilote de données.</p>
                                    <p>Posez-moi une question sur votre véhicule :</p>
                                    <ul className="list-disc pl-5 mt-1">
                                        <li>"Combien ai-je dépensé en carburant ce mois-ci ?"</li>
                                        <li>"Quel est mon kilométrage actuel ?"</li>
                                        <li>"Quand a eu lieu ma dernière vidange ?"</li>
                                    </ul>
                                </div>
                            </div>
                        )}
                        {conversation.map((msg, index) => (
                            <div key={index} className={cn("flex items-start gap-3", msg.role === 'user' && "justify-end")}>
                                {msg.role === 'model' && <Bot className="h-6 w-6 text-primary flex-shrink-0" />}
                                <div className={cn(
                                    "p-3 rounded-lg max-w-[80%] text-sm",
                                    msg.role === 'model' ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground"
                                )}>
                                    {msg.content}
                                </div>
                                {msg.role === 'user' && <User className="h-6 w-6 text-muted-foreground flex-shrink-0" />}
                            </div>
                        ))}
                         {isGenerating && (
                            <div className="flex items-start gap-3">
                               <Bot className="h-6 w-6 text-primary flex-shrink-0" />
                               <div className="p-3 rounded-lg bg-muted text-muted-foreground">
                                   <Loader2 className="h-5 w-5 animate-spin" />
                               </div>
                            </div>
                        )}
                    </div>
                </ScrollArea>
                 {error && (
                    <div className="p-4 border-t text-sm text-destructive bg-destructive/10 flex items-start gap-3">
                        <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <p>{error}</p>
                    </div>
                )}
                <SheetFooter className="p-4 border-t bg-background">
                    <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="w-full flex items-center gap-2">
                        <Textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Posez une question sur votre véhicule..."
                            className="flex-1 text-sm min-h-0 h-10 resize-none"
                            rows={1}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmit();
                                }
                            }}
                            disabled={!selectedVehicleId || isGenerating}
                        />
                        <Button type="submit" size="icon" disabled={!input.trim() || isGenerating}>
                            <Send className="h-4 w-4" />
                        </Button>
                    </form>
                </SheetFooter>
            </div>
        )
    }

    if (!user) return null;

    return (
        <>
            <Button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50"
                size="icon"
            >
                <Bot className="h-7 w-7" />
                <span className="sr-only">Ouvrir le chatbot</span>
            </Button>
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
                <SheetContent className="p-0 flex flex-col w-full sm:max-w-md" side="right">
                    <SheetHeader className="p-4 border-b flex-row justify-between items-center space-y-0">
                        <div>
                            <SheetTitle>Copilote IA</SheetTitle>
                            <SheetDescription>Posez des questions sur vos données.</SheetDescription>
                        </div>
                         <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="h-8 w-8">
                            <X className="h-4 w-4" />
                         </Button>
                    </SheetHeader>
                    <ChatbotContent />
                </SheetContent>
            </Sheet>
        </>
    );
}
