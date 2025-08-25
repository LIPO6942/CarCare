'use client';

import { useState, useRef, useEffect, useCallback, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from './ui/sheet';
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
import Image from 'next/image';

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
    
    const [conversation, setConversation] = useState<ChatMessage[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { transcript, startListening, stopListening, isListening, browserSupportsSpeechRecognition } = useSpeechRecognition();
    const [inputValue, setInputValue] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    
    const endOfMessagesRef = useRef<HTMLDivElement>(null);

    const fetchVehicles = useCallback(async () => {
        if (!user) return;
        setIsLoadingVehicles(true);
        const vehiclesData = await getVehicles(user.uid);
        setVehicles(vehiclesData);
        if (vehiclesData.length > 0) {
            setSelectedVehicleId(vehiclesData[0].id);
        }
        setIsLoadingVehicles(false);
    }, [user]);
    
    useEffect(() => {
        fetchVehicles();
    }, [fetchVehicles]);
    
     useEffect(() => {
        if (transcript) {
            setInputValue(transcript);
        }
    }, [transcript]);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [inputValue]);


    useEffect(() => {
        // Auto scroll to bottom
        if (endOfMessagesRef.current) {
            endOfMessagesRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [conversation]);

    const handleNewMessage = async (e: FormEvent) => {
        e.preventDefault();
        
        if (!inputValue.trim() || isGenerating || !selectedVehicleId) return;

        setError(null);
        const newQuestion = inputValue;
        setInputValue('');

        const userMessage: ChatMessage = {
            role: 'user',
            content: [{ text: newQuestion }],
        };
        setConversation(prev => [...prev, userMessage]);
        setIsGenerating(true);

        try {
            const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
            if (!selectedVehicle || !user) {
                throw new Error("Véhicule ou utilisateur non trouvé.");
            }

            // Fetch all data for the selected vehicle
            const [repairs, maintenance, fuelLogs] = await Promise.all([
                getRepairsForVehicle(selectedVehicle.id, user.uid),
                getMaintenanceForVehicle(selectedVehicle.id, user.uid),
                getFuelLogsForVehicle(selectedVehicle.id, user.uid),
            ]);
            
            const vehicleData = {
                ...selectedVehicle,
                repairs,
                maintenance,
                fuelLogs
            };

            const response = await answerFromHistory({
                history: conversation,
                question: newQuestion,
                vehicleDataJson: JSON.stringify(vehicleData, null, 2),
            });

            const modelMessage: ChatMessage = {
                role: 'model',
                content: [{ text: response.answer }],
            };
            setConversation(prev => [...prev, modelMessage]);

        } catch (err) {
            console.error(err);
            const errorMessage = err instanceof Error ? err.message : "Une erreur inconnue est survenue.";
            setError(errorMessage);
        } finally {
            setIsGenerating(false);
        }
    };
    
    if (isLoadingVehicles) {
        return (
            <div className="flex flex-col h-full p-4 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="mt-2 text-muted-foreground">Chargement des véhicules...</p>
            </div>
        )
    }
    
    if (vehicles.length === 0) {
        return (
             <div className="flex flex-col h-full items-center justify-center p-4 text-center">
                <Car className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="font-semibold text-lg">Aucun véhicule trouvé</h3>
                <p className="text-muted-foreground text-sm mb-4">Vous devez ajouter un véhicule avant de pouvoir utiliser le chatbot.</p>
                <Button asChild>
                    <Link href="/">Ajouter un véhicule</Link>
                </Button>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full">
            <div className="p-4 border-b">
                 <Select onValueChange={setSelectedVehicleId} value={selectedVehicleId}>
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Sélectionnez un véhicule" />
                    </SelectTrigger>
                    <SelectContent>
                        {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.brand} {v.model} ({v.licensePlate})</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
            <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                    {conversation.length === 0 && (
                        <div className="flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
                            <Bot className="w-12 h-12 mb-4"/>
                            <p>Posez-moi une question comme :<br/>"Combien ai-je dépensé en réparations ?"</p>
                        </div>
                    )}
                    {conversation.map((msg, index) => (
                        <div key={index} className={cn(
                            "flex items-start gap-3",
                            msg.role === 'user' ? 'justify-end' : 'justify-start'
                        )}>
                            {msg.role === 'model' && <div className="bg-primary/10 text-primary rounded-full p-2"><Bot size={20} /></div>}
                            
                            <div className={cn(
                                "p-3 rounded-lg max-w-sm whitespace-pre-wrap",
                                msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                            )}>
                                {msg.content[0].text}
                            </div>

                            {msg.role === 'user' && <div className="bg-muted rounded-full p-2"><User size={20} /></div>}
                        </div>
                    ))}
                    {isGenerating && (
                         <div className="flex items-start gap-3 justify-start">
                             <div className="bg-primary/10 text-primary rounded-full p-2"><Bot size={20} /></div>
                             <div className="p-3 rounded-lg bg-muted flex items-center">
                                 <Loader2 className="h-5 w-5 animate-spin" />
                             </div>
                         </div>
                    )}
                     <div ref={endOfMessagesRef} />
                </div>
            </ScrollArea>

            {error && (
                <div className="p-4 border-t text-sm text-destructive flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <p>{error}</p>
                </div>
            )}

            <SheetFooter className="p-4 border-t">
                <form onSubmit={handleNewMessage} className="w-full flex items-center gap-2">
                     <Textarea
                        ref={textareaRef}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Posez votre question..."
                        rows={1}
                        className="flex-1 resize-none text-base max-h-40"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleNewMessage(e as any);
                            }
                        }}
                    />
                    {browserSupportsSpeechRecognition && (
                         <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            onClick={isListening ? stopListening : startListening}
                            className={cn(isListening && "animate-pulse border-primary text-primary")}
                        >
                            {isListening ? <MicOff /> : <Mic />}
                        </Button>
                    )}
                    <Button type="submit" size="icon" disabled={isGenerating || !inputValue.trim()}>
                        <Send />
                    </Button>
                </form>
            </SheetFooter>
        </div>
    )
}

export function FloatingChatbot() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        className="fixed bottom-6 right-6 h-16 w-16 rounded-full shadow-lg z-50 flex items-center justify-center bg-primary hover:bg-primary/90 transition-all"
        onClick={() => setIsOpen(true)}
      >
        <Image src="https://storage.googleapis.com/project-spark-341015.appspot.com/static/docs/images/chat-bot.png" width={40} height={40} alt="Chatbot" />
        <span className="sr-only">Ouvrir le chatbot</span>
      </button>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent className="sm:max-w-lg p-0 flex flex-col h-full">
           <SheetHeader className="p-4 border-b">
                <SheetTitle>CarCare Copilot</SheetTitle>
                <SheetDescription>
                     Posez des questions sur les données de votre véhicule sélectionné.
                </SheetDescription>
            </SheetHeader>
            <ChatbotContent />
        </SheetContent>
      </Sheet>
    </>
  );
}
    