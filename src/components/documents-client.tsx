'use client';

import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Vehicle, Document } from '@/lib/types';
import { getVehicles, updateVehicle } from '@/lib/data';
import { addLocalDocument, deleteLocalDocument, getLocalDocumentsForVehicle, updateLocalDocument } from '@/lib/local-db';
import { useAuth } from '@/context/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from './ui/skeleton';
import { PlusCircle, FileText, Trash2, Download, Loader2, Car, Euro, Calendar, Edit, Fingerprint, Save, ChevronDown, ChevronUp, CheckCircle, RefreshCw, Eye, ChevronLeft, ChevronRight, ExternalLink, Layers } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DialogFooter } from './ui/dialog';
import Link from 'next/link';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Label } from './ui/label';
import { cn } from '@/lib/utils';



const safeFormatDate = (dateInput: any, formatString: string = 'P') => {
    try {
        if (!dateInput) return 'N/A';
        let date;
        if (typeof dateInput === 'object' && dateInput !== null && typeof (dateInput as any).toDate === 'function') {
            date = (dateInput as any).toDate();
        } else {
            date = new Date(dateInput);
        }
        if (isNaN(date.getTime())) {
            return 'Date invalide';
        }
        return format(date, formatString, { locale: fr });
    } catch (error) {
        return 'Erreur date';
    }
};

const safeFormatCurrency = (numInput: any): string => {
    try {
        const num = Number(numInput);
        if (isNaN(num)) return (0).toLocaleString('fr-FR', { style: 'currency', currency: 'TND' });
        return num.toLocaleString('fr-FR', { style: 'currency', currency: 'TND' });
    } catch {
        return (0).toLocaleString('fr-FR', { style: 'currency', currency: 'TND' });
    }
}

export function DocumentsClient() {
    const { user } = useAuth();
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
    const [documents, setDocuments] = useState<Document[]>([]);
    const [isLoadingVehicles, setIsLoadingVehicles] = useState(true);
    const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [dialogMode, setDialogMode] = useState<'add' | 'edit' | 'renew'>('add');
    const [itemToEdit, setItemToEdit] = useState<Document | null>(null);
    const [viewingDoc, setViewingDoc] = useState<Document | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<Document | null>(null);
    const [objectUrls, setObjectUrls] = useState<Map<number, { recto: string; verso?: string }>>(new Map());
    const [isVinEditing, setIsVinEditing] = useState(false);
    const [isVinCollapsed, setIsVinCollapsed] = useState(false);
    const { toast } = useToast();

    const searchParams = useSearchParams();
    const vehicleIdParam = searchParams.get('vehicleId');

    useEffect(() => {
        async function fetchVehicles() {
            if (!user) return;
            setIsLoadingVehicles(true);
            const vehiclesData = await getVehicles(user.uid);
            setVehicles(vehiclesData);
            
            // Priority: URL param > First vehicle in list
            if (vehicleIdParam && vehiclesData.some(v => v.id === vehicleIdParam)) {
                setSelectedVehicleId(vehicleIdParam);
            } else if (vehiclesData.length > 0) {
                setSelectedVehicleId(vehiclesData[0].id);
            }
            setIsLoadingVehicles(false);
        }
        fetchVehicles();
    }, [user, vehicleIdParam]);

    useEffect(() => {
        async function fetchDocuments() {
            if (!selectedVehicleId) {
                setDocuments([]);
                return;
            };
            setIsLoadingDocuments(true);
            const documentsData = await getLocalDocumentsForVehicle(selectedVehicleId);
            setDocuments(documentsData);
            setIsLoadingDocuments(false);
        }
        fetchDocuments();
    }, [selectedVehicleId]);

    useEffect(() => {
        const newUrls = new Map<number, { recto: string, verso?: string }>();
        documents.forEach(doc => {
            const urls: { recto: string, verso?: string } = {} as any;
            if (doc.fileRecto instanceof File) {
                urls.recto = URL.createObjectURL(doc.fileRecto);
            }
            if (doc.fileVerso instanceof File) {
                urls.verso = URL.createObjectURL(doc.fileVerso);
            }
            if (urls.recto) {
                newUrls.set(doc.id, urls);
            }
        });
        setObjectUrls(newUrls);

        return () => {
            newUrls.forEach(urlObj => {
                URL.revokeObjectURL(urlObj.recto);
                if (urlObj.verso) {
                    URL.revokeObjectURL(urlObj.verso);
                }
            });
        };
    }, [documents]);

    const onDataChange = async () => {
        if (!selectedVehicleId) return;
        setIsLoadingDocuments(true);
        const documentsData = await getLocalDocumentsForVehicle(selectedVehicleId);
        setDocuments(documentsData);
        setIsLoadingDocuments(false);
    }

    const handleAdd = () => {
        setItemToEdit(null);
        setDialogMode('add');
        setIsDialogOpen(true);
    };

    const handleEdit = (doc: Document) => {
        setItemToEdit(doc);
        setDialogMode('edit');
        setIsDialogOpen(true);
    };

    const handleRenew = (doc: Document) => {
        setItemToEdit(doc);
        setDialogMode('renew');
        setIsDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!itemToDelete) return;
        setIsDeleting(true);
        try {
            await deleteLocalDocument(itemToDelete.id);
            toast({ title: 'Succès', description: 'Document supprimé.' });
            onDataChange();
            setItemToDelete(null);
        } catch (error) {
            toast({ title: 'Erreur', description: "Impossible de supprimer le document.", variant: 'destructive' });
        } finally {
            setIsDeleting(false);
        }
    };

    if (isLoadingVehicles) {
        return (
            <div className="space-y-4 mt-6">
                <Skeleton className="h-10 w-full max-w-sm" />
                <Skeleton className="h-64 w-full" />
            </div>
        )
    }

    if (vehicles.length === 0) {
        return (
            <Card className="mt-6">
                <CardHeader>
                    <CardTitle>Aucun véhicule</CardTitle>
                    <CardDescription>Vous devez d'abord ajouter un véhicule pour pouvoir gérer ses documents.</CardDescription>
                </CardHeader>
                <CardContent className="text-center py-12 text-muted-foreground">
                    <Car className="mx-auto h-12 w-12 mb-4" />
                    <h3 className="text-lg font-semibold">Aucun véhicule trouvé</h3>
                    <p>Veuillez retourner au tableau de bord pour ajouter un véhicule.</p>
                </CardContent>
            </Card>
        )
    }

    return (
        <>
            <div className="flex flex-col sm:flex-row gap-4 mt-6 items-center">
                <Select onValueChange={setSelectedVehicleId} defaultValue={selectedVehicleId || undefined}>
                    <SelectTrigger className="w-full sm:w-[300px]">
                        <SelectValue placeholder="Sélectionnez un véhicule" />
                    </SelectTrigger>
                    <SelectContent>
                        {vehicles.map(vehicle => (
                            <SelectItem key={vehicle.id} value={vehicle.id}>
                                {vehicle.brand} {vehicle.model} ({vehicle.licensePlate})
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Button onClick={handleAdd} className="w-full sm:w-auto ml-auto" disabled={!selectedVehicleId}>
                    <PlusCircle className="mr-2 h-4 w-4" />Ajouter un document
                </Button>
            </div>

            {selectedVehicleId && (
                <Card className="mt-6 overflow-hidden transition-all duration-300">
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-4" onClick={() => setIsVinCollapsed(!isVinCollapsed)}>
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                                    <Fingerprint className="h-5 w-5 text-primary" />
                                    Numéro de Châssis (VIN)
                                    {vehicles.find(v => v.id === selectedVehicleId)?.vin && !isVinEditing && (
                                        <CheckCircle className="h-4 w-4 text-green-500 ml-1" />
                                    )}
                                </CardTitle>
                                <CardDescription className="text-xs sm:text-sm">
                                    Gérez le VIN de votre véhicule.
                                </CardDescription>
                            </div>
                            {isVinCollapsed ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronUp className="h-5 w-5 text-muted-foreground" />}
                        </div>
                    </CardHeader>
                    {!isVinCollapsed && (
                        <CardContent className="pt-0 pb-6">
                            <div className="flex flex-col sm:flex-row gap-3 items-end">
                                <div className="flex-1 space-y-2 w-full">
                                    <div className="flex justify-between items-center">
                                        <Label htmlFor="vin-input">VIN du véhicule</Label>
                                        {vehicles.find(v => v.id === selectedVehicleId)?.vin && !isVinEditing && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 px-2 text-xs"
                                                onClick={() => setIsVinEditing(true)}
                                            >
                                                <Edit className="h-3 w-3 mr-1" /> Modifier
                                            </Button>
                                        )}
                                    </div>
                                    <div className="relative">
                                        <Input
                                            id="vin-input"
                                            placeholder="Ex: 17 caractères (VF...)"
                                            value={vehicles.find(v => v.id === selectedVehicleId)?.vin || ''}
                                            onChange={(e) => {
                                                const newVin = e.target.value.toUpperCase();
                                                setVehicles(prev => prev.map(v => v.id === selectedVehicleId ? { ...v, vin: newVin } : v));
                                            }}
                                            maxLength={17}
                                            disabled={!!vehicles.find(v => v.id === selectedVehicleId)?.vin && !isVinEditing}
                                            className={cn(
                                                "uppercase tracking-widest font-mono",
                                                vehicles.find(v => v.id === selectedVehicleId)?.vin && !isVinEditing && "bg-muted text-muted-foreground opacity-70"
                                            )}
                                        />
                                    </div>
                                </div>
                                {(!vehicles.find(v => v.id === selectedVehicleId)?.vin || isVinEditing) && (
                                    <div className="flex gap-2 w-full sm:w-auto">
                                        {isVinEditing && (
                                            <Button
                                                variant="outline"
                                                className="flex-1 sm:flex-none"
                                                onClick={() => setIsVinEditing(false)}
                                            >
                                                Annuler
                                            </Button>
                                        )}
                                        <Button
                                            onClick={async () => {
                                                const vehicle = vehicles.find(v => v.id === selectedVehicleId);
                                                if (vehicle) {
                                                    try {
                                                        await updateVehicle(vehicle.id, { vin: vehicle.vin });
                                                        toast({ title: 'Succès', description: 'Le VIN a été mis à jour.' });
                                                        setIsVinEditing(false);
                                                        // Automatically collapse after a short delay for better UX
                                                        setTimeout(() => setIsVinCollapsed(true), 1500);
                                                    } catch (error) {
                                                        toast({ title: 'Erreur', description: 'Impossible de mettre à jour le VIN.', variant: 'destructive' });
                                                    }
                                                }
                                            }}
                                            className="flex-1 sm:flex-none"
                                        >
                                            <Save className="mr-2 h-4 w-4" /> Enregistrer
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    )}
                </Card>
            )}

            <Card className="mt-6">
                <CardHeader>
                    <CardTitle>Documents du Véhicule</CardTitle>
                    <CardDescription>Stockez et consultez tous vos documents importants.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoadingDocuments ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Loader2 className="mx-auto h-12 w-12 animate-spin mb-4" />
                            <p>Chargement des documents...</p>
                        </div>
                    ) : documents.length > 0 ? (
                        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                            {documents.map((doc) => {
                                const docUrls = objectUrls.get(doc.id);
                                return (
                                    <Card key={doc.id} className="group relative flex flex-col overflow-hidden">
                                        <CardHeader>
                                            <CardTitle className="flex items-center gap-2 text-lg">
                                                <FileText className="h-5 w-5 text-primary" />
                                                <span className="truncate">{doc.name}</span>
                                            </CardTitle>
                                            <CardDescription className="text-xs">
                                                {doc.type} • {doc.updatedAt ? `Renouvelé le ${safeFormatDate(doc.updatedAt)}` : `Ajouté le ${safeFormatDate(doc.createdAt)}`}
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent className="flex-1 space-y-3">
                                            {doc.type === 'Facture' && (doc.invoiceDate || doc.invoiceAmount) && (
                                                <div className="text-sm text-muted-foreground space-y-1">
                                                    {doc.invoiceDate && <p className="flex items-center gap-2"><Calendar className="h-4 w-4" /> {safeFormatDate(doc.invoiceDate)}</p>}
                                                    {doc.invoiceAmount && <p className="flex items-center gap-2"><Euro className="h-4 w-4" /> {safeFormatCurrency(doc.invoiceAmount)}</p>}
                                                </div>
                                            )}
                                            <Button
                                                variant="secondary"
                                                className="w-full text-xs sm:text-sm flex items-center justify-center gap-2 font-medium bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 h-9"
                                                disabled={!docUrls?.recto}
                                                onClick={() => setViewingDoc(doc)}
                                            >
                                                <Eye className="h-4 w-4 shrink-0" />
                                                <span>Consulter le document</span>
                                                {doc.fileVerso && (
                                                    <span className="text-[10px] bg-primary/20 text-primary font-semibold px-2 py-0.5 rounded-full ml-1">
                                                        Recto & Verso
                                                    </span>
                                                )}
                                            </Button>

                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleRenew(doc)}
                                                className="w-full text-xs font-medium border-dashed hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors flex items-center justify-center gap-1.5 h-8 mt-1"
                                            >
                                                <RefreshCw className="h-3.5 w-3.5 text-primary" /> Renouveler ce document
                                            </Button>
                                        </CardContent>
                                        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-background/80 sm:bg-transparent backdrop-blur-sm sm:backdrop-blur-none rounded-md p-0.5">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                                                title="Consulter"
                                                onClick={() => setViewingDoc(doc)}
                                            >
                                                <Eye className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                                                title="Renouveler"
                                                onClick={() => handleRenew(doc)}
                                            >
                                                <RefreshCw className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                                title="Modifier"
                                                onClick={() => handleEdit(doc)}
                                            >
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-destructive hover:text-destructive"
                                                title="Supprimer"
                                                onClick={() => setItemToDelete(doc)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </Card>
                                )
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground">
                            <FileText className="mx-auto h-12 w-12 mb-4" />
                            <h3 className="text-lg font-semibold">Aucun document</h3>
                            <p>Ajoutez les documents importants de votre véhicule.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
            {selectedVehicleId && <DocumentDialog
                key={itemToEdit ? `${dialogMode}-${itemToEdit.id}` : `add-${dialogMode}`}
                open={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                vehicleId={selectedVehicleId}
                onDataChange={onDataChange}
                initialData={itemToEdit}
                mode={dialogMode}
                existingDocuments={documents}
            />}

            <DocumentViewerDialog
                doc={viewingDoc}
                docUrls={viewingDoc ? objectUrls.get(viewingDoc.id) : undefined}
                open={!!viewingDoc}
                onOpenChange={(open) => {
                    if (!open) setViewingDoc(null);
                }}
                onRenew={handleRenew}
            />

            <DeleteConfirmationDialog
                open={!!itemToDelete}
                onOpenChange={() => setItemToDelete(null)}
                onConfirm={handleDeleteConfirm}
                isDeleting={isDeleting}
                title="Supprimer le document ?"
                description="Cette action est irréversible et supprimera définitivement le fichier localement."
            />
        </>
    );
}


function suggestNextName(currentName: string): string {
    const yearMatch = currentName.match(/\b(20\d\d)\b/);
    if (yearMatch) {
        const nextYear = parseInt(yearMatch[1], 10) + 1;
        return currentName.replace(yearMatch[1], String(nextYear));
    }
    const currentYear = new Date().getFullYear();
    return `${currentName} (${currentYear})`;
}

function DocumentDialog({
    open,
    onOpenChange,
    vehicleId,
    onDataChange,
    initialData,
    mode = 'add',
    existingDocuments = []
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    vehicleId: string;
    onDataChange: () => void;
    initialData: Document | null;
    mode: 'add' | 'edit' | 'renew';
    existingDocuments: Document[];
}) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [files, setFiles] = useState<{ recto: File | null; verso: File | null }>({ recto: null, verso: null });
    const [docType, setDocType] = useState<Document['type'] | ''>(initialData?.type || '');
    const [docName, setDocName] = useState<string>('');
    const [docToReplaceId, setDocToReplaceId] = useState<number | null>(null);
    const fileInputRectoRef = useRef<HTMLInputElement>(null);
    const fileInputVersoRef = useRef<HTMLInputElement>(null);

    const documentTypes: Document['type'][] = [
        'Carte Grise',
        'Assurance',
        'Facture',
        'Visite Technique',
        'Permis de Conduite',
        'CIN',
        'Vignette',
        'Autre'
    ];

    useEffect(() => {
        if (!open) {
            setFiles({ recto: null, verso: null });
            setDocType('');
            setDocName('');
            setDocToReplaceId(null);
            if (fileInputRectoRef.current) fileInputRectoRef.current.value = '';
            if (fileInputVersoRef.current) fileInputVersoRef.current.value = '';
        } else {
            if (mode === 'renew' && initialData) {
                setDocType(initialData.type);
                setDocName(suggestNextName(initialData.name));
                setDocToReplaceId(initialData.id);
            } else if (mode === 'edit' && initialData) {
                setDocType(initialData.type);
                setDocName(initialData.name);
                setDocToReplaceId(null);
            } else {
                setDocType('');
                setDocName('');
                setDocToReplaceId(null);
            }
        }
    }, [open, initialData, mode]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>, side: 'recto' | 'verso') => {
        if (event.target.files && event.target.files[0]) {
            setFiles(prev => ({ ...prev, [side]: event.target.files![0] }));
        }
    };

    const handleTypeChange = (newType: Document['type']) => {
        setDocType(newType);
        if (mode === 'add') {
            setDocToReplaceId(null);
        }
    };

    const matchingExistingDocs = mode === 'add' && docType
        ? existingDocuments.filter(d => d.type === docType)
        : [];

    const isReplacing = (mode === 'renew' && !!initialData) || (mode === 'add' && docToReplaceId !== null);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (mode === 'add' && !docToReplaceId && !files.recto) {
            toast({ title: 'Erreur', description: 'Veuillez sélectionner un fichier (recto) pour le nouveau document.', variant: 'destructive' });
            return;
        }

        if (mode === 'renew' && !files.recto) {
            toast({ title: 'Erreur', description: 'Veuillez sélectionner le nouveau fichier (recto) pour le renouvellement.', variant: 'destructive' });
            return;
        }

        if (mode === 'add' && docToReplaceId !== null && !files.recto) {
            toast({ title: 'Erreur', description: 'Veuillez sélectionner le fichier du nouveau document de remplacement.', variant: 'destructive' });
            return;
        }

        if (!docType) {
            toast({ title: 'Erreur', description: 'Veuillez sélectionner un type de document.', variant: 'destructive' });
            return;
        }

        setIsSubmitting(true);
        const formData = new FormData(event.currentTarget);
        const name = (formData.get('name') as string)?.trim() || docName || (files.recto ? files.recto.name.replace(/\.[^/.]+$/, "") : 'Document');

        try {
            const invoiceDate = docType === 'Facture' ? ((formData.get('invoiceDate') as string) || undefined) : undefined;
            const invoiceAmountRaw = docType === 'Facture' ? (formData.get('invoiceAmount') as string) : undefined;
            const invoiceAmount = invoiceAmountRaw ? parseFloat(invoiceAmountRaw) : undefined;

            const targetId = (mode === 'renew' && initialData) ? initialData.id : docToReplaceId;

            if (targetId !== null && targetId !== undefined) {
                // Remplacement / Renouvellement : mise à jour en écrasant l'ancien fichier
                await updateLocalDocument(
                    targetId,
                    {
                        name,
                        type: docType,
                        invoiceDate,
                        invoiceAmount,
                    },
                    files.recto || files.verso ? {
                        recto: files.recto,
                        verso: files.verso,
                    } : undefined
                );
                toast({
                    title: "Succès",
                    description: mode === 'renew' ? "Document renouvelé avec succès." : "Document remplacé avec succès."
                });
            } else if (mode === 'edit' && initialData) {
                // Modification standard
                await updateLocalDocument(
                    initialData.id,
                    {
                        name,
                        type: docType,
                        invoiceDate,
                        invoiceAmount,
                    },
                    files.recto || files.verso ? {
                        recto: files.recto,
                        verso: files.verso,
                    } : undefined
                );
                toast({ title: "Succès", description: "Document mis à jour." });
            } else {
                // Ajout d'un nouveau document
                const documentInfo: Omit<Document, 'id' | 'vehicleId' | 'fileRecto' | 'fileVerso' | 'createdAt'> & { vehicleId?: string } = {
                    name,
                    type: docType,
                    invoiceDate,
                    invoiceAmount,
                };
                await addLocalDocument(vehicleId, files as { recto: File; verso?: File | null }, documentInfo);
                toast({ title: "Succès", description: "Document ajouté localement." });
            }

            onOpenChange(false);
            onDataChange();

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Impossible d'enregistrer le document.";
            toast({ title: "Erreur de stockage local", description: errorMessage, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    let dialogTitle = "Ajouter un document";
    let dialogDesc = "Téléchargez les fichiers qui seront stockés localement dans votre navigateur.";

    if (mode === 'renew') {
        dialogTitle = `Renouveler : ${initialData?.name || 'Document'}`;
        dialogDesc = "Importez la nouvelle version du document pour remplacer l'ancienne sans la recréer.";
    } else if (mode === 'edit') {
        dialogTitle = `Modifier le document`;
        dialogDesc = "Modifiez les informations ou mettez à jour les fichiers du document.";
    } else if (isReplacing) {
        dialogTitle = "Remplacer un document existant";
        dialogDesc = "Le document existant sélectionné sera remplacé par le nouveau fichier.";
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{dialogTitle}</DialogTitle>
                    <DialogDescription>{dialogDesc}</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <Label htmlFor="doc-name">Nom du document</Label>
                        <Input
                            id="doc-name"
                            name="name"
                            placeholder="Ex: Assurance 2026, Facture garage..."
                            required
                            value={docName}
                            onChange={(e) => setDocName(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Type de document</Label>
                        <Select
                            onValueChange={(value) => handleTypeChange(value as Document['type'])}
                            value={docType}
                            required
                            disabled={mode === 'renew'}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Sélectionnez un type" />
                            </SelectTrigger>
                            <SelectContent>
                                {documentTypes.map(type => (
                                    <SelectItem key={type} value={type}>
                                        {type}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {mode === 'add' && matchingExistingDocs.length > 0 && (
                        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                                <RefreshCw className="h-3.5 w-3.5" />
                                Document « {docType} » déjà existant
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Un document de ce type existe déjà. Souhaitez-vous le remplacer par cette nouvelle version ?
                            </p>
                            <div className="grid grid-cols-2 gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setDocToReplaceId(null)}
                                    className={cn(
                                        "p-2 text-xs rounded-md border text-center transition-all",
                                        docToReplaceId === null
                                            ? "border-primary bg-primary text-primary-foreground font-medium shadow-sm"
                                            : "border-border bg-background hover:bg-muted text-foreground"
                                    )}
                                >
                                    Nouveau document
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (matchingExistingDocs.length > 0) {
                                            const target = matchingExistingDocs[0];
                                            setDocToReplaceId(target.id);
                                            setDocName(suggestNextName(target.name));
                                        }
                                    }}
                                    className={cn(
                                        "p-2 text-xs rounded-md border text-center transition-all",
                                        docToReplaceId !== null
                                            ? "border-primary bg-primary text-primary-foreground font-medium shadow-sm"
                                            : "border-border bg-background hover:bg-muted text-foreground"
                                    )}
                                >
                                    Remplacer l'existant
                                </button>
                            </div>
                            {docToReplaceId !== null && matchingExistingDocs.length > 1 && (
                                <div className="pt-2 space-y-1">
                                    <Label className="text-xs">Document à remplacer :</Label>
                                    <Select
                                        value={String(docToReplaceId)}
                                        onValueChange={(val) => {
                                            const target = matchingExistingDocs.find(d => d.id === Number(val));
                                            setDocToReplaceId(Number(val));
                                            if (target) setDocName(suggestNextName(target.name));
                                        }}
                                    >
                                        <SelectTrigger className="h-8 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {matchingExistingDocs.map(d => (
                                                <SelectItem key={d.id} value={String(d.id)} className="text-xs">
                                                    {d.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>
                    )}

                    {docType === 'Facture' && (
                        <div className="space-y-4 rounded-md border p-4">
                            <h4 className="text-sm font-medium">Détails de la facture (Optionnel)</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="invoiceDate">Date</Label>
                                    <Input id="invoiceDate" name="invoiceDate" type="date" defaultValue={initialData?.invoiceDate?.split('T')[0]} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="invoiceAmount">Montant (TND)</Label>
                                    <Input id="invoiceAmount" name="invoiceAmount" type="number" step="0.001" placeholder="Ex: 250" defaultValue={initialData?.invoiceAmount} />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="file-upload-recto">
                                {mode === 'edit'
                                    ? "Remplacer le fichier Recto (Optionnel)"
                                    : (isReplacing ? "Nouveau fichier Recto (Obligatoire)" : "Fichier Recto (Obligatoire)")}
                            </Label>
                            <Input
                                id="file-upload-recto"
                                type="file"
                                required={mode !== 'edit'}
                                onChange={(e) => handleFileChange(e, 'recto')}
                                ref={fileInputRectoRef}
                            />
                            {mode === 'edit' && (
                                <p className="text-xs text-muted-foreground">Laisser vide pour conserver le fichier Recto actuel.</p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="file-upload-verso">
                                {mode === 'edit'
                                    ? "Remplacer le fichier Verso (Optionnel)"
                                    : (isReplacing ? "Nouveau fichier Verso (Optionnel)" : "Fichier Verso (Optionnel)")}
                            </Label>
                            <Input
                                id="file-upload-verso"
                                type="file"
                                onChange={(e) => handleFileChange(e, 'verso')}
                                ref={fileInputVersoRef}
                            />
                            {mode === 'edit' && (
                                <p className="text-xs text-muted-foreground">Laisser vide pour conserver le fichier Verso actuel.</p>
                            )}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                            Annuler
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {mode === 'renew' ? 'Renouveler' : (isReplacing ? 'Remplacer' : (mode === 'edit' ? 'Enregistrer' : 'Ajouter'))}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function DeleteConfirmationDialog({ open, onOpenChange, onConfirm, isDeleting, title, description }: { open: boolean, onOpenChange: (open: boolean) => void, onConfirm: () => void, isDeleting: boolean, title: string, description: string }) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                        disabled={isDeleting}
                        onClick={onConfirm}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {isDeleting ? 'Suppression...' : 'Supprimer'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

function DocumentViewerDialog({
    doc,
    docUrls,
    open,
    onOpenChange,
    onRenew,
}: {
    doc: Document | null;
    docUrls?: { recto: string; verso?: string };
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onRenew?: (doc: Document) => void;
}) {
    const [activeSide, setActiveSide] = useState<'recto' | 'verso'>('recto');
    const [viewMode, setViewMode] = useState<'single' | 'both'>('single');

    useEffect(() => {
        if (open) {
            setActiveSide('recto');
            setViewMode('single');
        }
    }, [open, doc]);

    // Keyboard navigation (ArrowLeft for Recto, ArrowRight for Verso)
    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') {
                setActiveSide('recto');
            } else if (e.key === 'ArrowRight' && docUrls?.verso) {
                setActiveSide('verso');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, docUrls]);

    if (!doc || !docUrls?.recto) return null;

    const hasBoth = Boolean(docUrls?.verso);

    const isPdf = (file?: File) => {
        if (!file) return false;
        return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    };

    const currentFile = activeSide === 'recto' ? doc.fileRecto : doc.fileVerso;
    const currentUrl = activeSide === 'recto' ? docUrls.recto : docUrls.verso;

    const renderFilePreview = (file?: File, url?: string, label?: string) => {
        if (!url || !file) {
            return (
                <div className="py-12 text-center text-muted-foreground text-sm">
                    Aucun fichier disponible
                </div>
            );
        }
        if (isPdf(file)) {
            return (
                <iframe
                    src={url}
                    title={`${label || 'Document'} - ${doc.name}`}
                    className="w-full h-[62vh] rounded-md border bg-background"
                />
            );
        }
        return (
            <div className="relative w-full flex items-center justify-center p-2">
                <img
                    src={url}
                    alt={`${label || 'Document'} - ${doc.name}`}
                    className="max-h-[62vh] max-w-full object-contain rounded-md shadow-md transition-all duration-200"
                />
            </div>
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-4xl max-h-[92vh] flex flex-col p-4 sm:p-6 overflow-hidden">
                <DialogHeader className="space-y-1 pb-3 border-b">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pr-6">
                        <div>
                            <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
                                <FileText className="h-5 w-5 text-primary" />
                                <span>{doc.name}</span>
                            </DialogTitle>
                            <DialogDescription className="text-xs">
                                {doc.type} • {doc.updatedAt ? `Renouvelé le ${safeFormatDate(doc.updatedAt)}` : `Ajouté le ${safeFormatDate(doc.createdAt)}`}
                            </DialogDescription>
                        </div>

                        {/* Switcher Controls */}
                        {hasBoth && (
                            <div className="flex items-center gap-1 bg-muted/80 p-1 rounded-lg border self-start sm:self-auto">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setViewMode('single');
                                        setActiveSide('recto');
                                    }}
                                    className={cn(
                                        "px-3 py-1 text-xs rounded-md transition-all font-medium flex items-center gap-1.5",
                                        viewMode === 'single' && activeSide === 'recto'
                                            ? "bg-background text-foreground shadow-sm font-semibold"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Recto
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setViewMode('single');
                                        setActiveSide('verso');
                                    }}
                                    className={cn(
                                        "px-3 py-1 text-xs rounded-md transition-all font-medium flex items-center gap-1.5",
                                        viewMode === 'single' && activeSide === 'verso'
                                            ? "bg-background text-foreground shadow-sm font-semibold"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Verso
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewMode('both')}
                                    className={cn(
                                        "px-2.5 py-1 text-xs rounded-md transition-all font-medium flex items-center gap-1",
                                        viewMode === 'both'
                                            ? "bg-background text-foreground shadow-sm font-semibold"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                    title="Afficher les 2 pages ensemble pour défiler"
                                >
                                    <Layers className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">Dérouler les 2</span>
                                </button>
                            </div>
                        )}
                    </div>
                </DialogHeader>

                {/* Content Viewer */}
                <div className="flex-1 overflow-y-auto py-3">
                    {viewMode === 'single' ? (
                        <div className="relative flex items-center justify-center min-h-[350px] bg-muted/20 rounded-xl p-2 border">
                            {hasBoth && (
                                <>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="absolute left-2 top-1/2 -translate-y-1/2 z-10 rounded-full shadow-md bg-background/95 hover:bg-background h-9 w-9"
                                        disabled={activeSide === 'recto'}
                                        onClick={() => setActiveSide('recto')}
                                        title="Voir Recto (Touche Flèche Gauche)"
                                    >
                                        <ChevronLeft className="h-5 w-5" />
                                    </Button>

                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="absolute right-2 top-1/2 -translate-y-1/2 z-10 rounded-full shadow-md bg-background/95 hover:bg-background h-9 w-9"
                                        disabled={activeSide === 'verso'}
                                        onClick={() => setActiveSide('verso')}
                                        title="Voir Verso (Touche Flèche Droite)"
                                    >
                                        <ChevronRight className="h-5 w-5" />
                                    </Button>
                                </>
                            )}

                            {renderFilePreview(currentFile, currentUrl, activeSide === 'recto' ? 'Recto' : 'Verso')}

                            {hasBoth && (
                                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium border shadow-sm">
                                    {activeSide === 'recto' ? 'Page 1 : Recto' : 'Page 2 : Verso'}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Mode déroulant (les 2 pages affichées l'une après l'autre pour défilement direct) */
                        <div className="space-y-4 pr-1">
                            <div className="space-y-1.5">
                                <div className="text-xs font-semibold text-primary flex items-center gap-1.5 px-1">
                                    <span className="w-2 h-2 rounded-full bg-primary" />
                                    Page 1 : Recto
                                </div>
                                <div className="border rounded-xl bg-muted/20 p-2 flex items-center justify-center">
                                    {renderFilePreview(doc.fileRecto, docUrls.recto, 'Recto')}
                                </div>
                            </div>

                            {doc.fileVerso && docUrls.verso && (
                                <div className="space-y-1.5">
                                    <div className="text-xs font-semibold text-primary flex items-center gap-1.5 px-1">
                                        <span className="w-2 h-2 rounded-full bg-primary" />
                                        Page 2 : Verso
                                    </div>
                                    <div className="border rounded-xl bg-muted/20 p-2 flex items-center justify-center">
                                        {renderFilePreview(doc.fileVerso, docUrls.verso, 'Verso')}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t">
                    <div className="flex flex-wrap items-center gap-2">
                        {currentUrl && (
                            <>
                                <Button asChild variant="outline" size="sm" className="h-8 text-xs">
                                    <a
                                        href={currentUrl}
                                        download={currentFile?.name || `${doc.name}-${activeSide}`}
                                    >
                                        <Download className="h-3.5 w-3.5 mr-1.5" />
                                        Télécharger {hasBoth && viewMode === 'single' ? (activeSide === 'recto' ? 'Recto' : 'Verso') : ''}
                                    </a>
                                </Button>
                                <Button asChild variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground">
                                    <a
                                        href={currentUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                                        Plein écran
                                    </a>
                                </Button>
                            </>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => {
                                onOpenChange(false);
                                if (onRenew) onRenew(doc);
                            }}
                        >
                            <RefreshCw className="h-3.5 w-3.5 mr-1.5 text-primary" />
                            Renouveler
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => onOpenChange(false)}
                        >
                            Fermer
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
