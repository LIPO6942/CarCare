
'use client';

import { useState, useRef, useEffect, useCallback, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Bot, User, Send, Loader2, AlertTriangle, Car, Mic, MicOff } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { getVehicles, getRepairsForVehicle, getMaintenanceForVehicle, getFuelLogsForVehicle } from '@/lib/data';
import type { Vehicle } from '@/lib/types';
import { Textarea } from './ui/textarea';
import { answerFromHistory } from '@/ai/flows/answer-from-history';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ScrollArea } from './ui/scroll-area';
import { Skeleton } from './ui/skeleton';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useSpeechRecognition } from '@/hooks/use-speech-recognition';
import { useToast } from '@/hooks/use-toast';

type ChatMessage = {
    role: 'user' | 'model';
    content: { text: string }[];
};

function ChatbotContent() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
    const [isLoadingVehicles, setIsLoadingVehicles] = useState(true);
    const [inputValue, setInputValue] = useState('');

    const [conversation, setConversation] = useState<ChatMessage[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    
    const {
        isListening,
        transcript,
        startListening,
        stopListening,
        browserSupportsSpeechRecognition
    } = useSpeechRecognition();

    useEffect(() => {
        setInputValue(transcript);
    }, [transcript]);

    const handleMicClick = () => {
        if (!browserSupportsSpeechRecognition) {
            toast({
                title: "Fonctionnalité non supportée",
                description: "Votre navigateur ne supporte pas la reconnaissance vocale.",
                variant: 'destructive'
            });
            return;
        }
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    };


    const fetchVehicles = useCallback(async () => {
        if (!user) return;
        setIsLoadingVehicles(true);
        const userVehicles = await getVehicles(user.uid);
        setVehicles(userVehicles);
        if (userVehicles.length > 0 && !selectedVehicleId) {
            setSelectedVehicleId(userVehicles[0].id);
        }
        setIsLoadingVehicles(false);
    }, [user, selectedVehicleId]);
    
    useEffect(() => {
        fetchVehicles();
        setError(null);
    }, [fetchVehicles]);

    useEffect(() => {
        // Auto scroll to bottom
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTo({
                top: scrollAreaRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, [conversation]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        
        if (isListening) stopListening();

        const currentInput = inputValue;
        if (!currentInput?.trim() || isGenerating || !selectedVehicleId) return;

        if (!user) {
            setError("Impossible d'envoyer le message. Utilisateur non valide.");
            return;
        }
        
        const userMessage: ChatMessage = { role: 'user', content: [{ text: currentInput }] };
        const newConversation: ChatMessage[] = [...conversation, userMessage];
        
        setConversation(newConversation);
        setInputValue('');
        setIsGenerating(true);
        setError(null);

        try {
            const [repairs, maintenance, fuelLogs] = await Promise.all([
                getRepairsForVehicle(selectedVehicleId, user.uid),
                getMaintenanceForVehicle(selectedVehicleId, user.uid),
                getFuelLogsForVehicle(selectedVehicleId, user.uid),
            ]);

            const vehicleData = { repairs, maintenance, fuelLogs };
            const vehicleDataJson = JSON.stringify(vehicleData, null, 2);

            const response = await answerFromHistory({
                history: conversation,
                question: currentInput,
                vehicleDataJson: vehicleDataJson,
            });
            
             if (response.answer.includes("Désolé, la limite de requêtes gratuites")) {
                setError(response.answer);
            }

            const modelMessage: ChatMessage = { role: 'model', content: [{ text: response.answer }] };
            setConversation(prev => [...prev, modelMessage]);

        } catch (err) {
            console.error("Error in chatbot handleSubmit", err);
            const errorMessage = err instanceof Error ? err.message : "Une erreur inconnue est survenue.";
            setError(`Désolé, une erreur est survenue lors de la communication avec le copilote IA. Détails : ${errorMessage}`);
            setConversation(conversation);
            setInputValue(currentInput);
        } finally {
            setIsGenerating(false);
        }
    };
    
    const handleVehicleChange = (vehicleId: string) => {
        setSelectedVehicleId(vehicleId);
        setConversation([]); // Reset conversation when vehicle changes
        setError(null);
    }
    
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
                <Button asChild>
                    <Link href="/">Aller au tableau de bord</Link>
                </Button>
            </div>
        )
    }

    return (
        <div className="flex-1 flex flex-col min-h-0">
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
                                {msg.content[0]?.text}
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
                <form
                    onSubmit={handleSubmit}
                    className="w-full flex items-center gap-2"
                >
                    <Textarea
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder={isListening ? "Écoute en cours..." : "Posez une question sur votre véhicule..."}
                        className="flex-1 text-sm min-h-0 h-10 resize-none"
                        rows={1}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit(e as any);
                            }
                        }}
                        disabled={!selectedVehicleId || isGenerating}
                    />
                    <Button type="button" size="icon" onClick={handleMicClick} disabled={!browserSupportsSpeechRecognition || isGenerating} variant={isListening ? "destructive" : "secondary"}>
                        {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                        <span className="sr-only">{isListening ? 'Arrêter l\'écoute' : 'Démarrer l\'écoute'}</span>
                    </Button>
                    <Button type="submit" size="icon" disabled={isGenerating}>
                        <Send className="h-4 w-4" />
                    </Button>
                </form>
            </SheetFooter>
        </div>
    )
}

export function FloatingChatbot() {
    const { user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    
    if (!user) return null;

    return (
        <>
            <Button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 p-0 overflow-hidden"
                size="icon"
            >
                <img src="https://images.unsplash.com/photo-1542282088-fe8426682b8f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3NDE5ODJ8MHwxfHNlYXJjaHwxNXx8Q2FyfGVufDB8fHx8MTc1NjA0NDcyMXww&ixlib=rb-4.1.0&q=80&w=1080" alt="Ouvrir le chatbot" className="h-full w-full object-cover" />
                <span className="sr-only">Ouvrir le chatbot</span>
            </Button>
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
                <SheetContent className="p-0 flex flex-col w-full sm:max-w-md h-full" side="right">
                    <SheetHeader className="p-4 border-b">
                        <SheetTitle>Copilote IA</SheetTitle>
                        <SheetDescription>Posez des questions sur vos données.</SheetDescription>
                    </SheetHeader>
                    {isOpen && <ChatbotContent />}
                </SheetContent>
            </Sheet>
        </>
    );
}
